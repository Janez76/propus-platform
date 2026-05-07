<?php
/**
 * Propus Codestudio – Kontaktformular Endpoint
 *
 * Nimmt POST von /api/contact.php (codestudio.propus.ch) entgegen, validiert,
 * verschickt Mail über lokales Postfix (Sender: noreply@propuscode.ch mit
 * gültigem SPF/DKIM) an codestudio@propus.ch.
 *
 * Antwortet mit JSON: {"ok": true} oder {"ok": false, "error": "..."}.
 */

declare(strict_types=1);

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Robots-Tag: noindex');

const RECIPIENT          = 'codestudio@propus.ch';
const SENDER_EMAIL       = 'noreply@propuscode.ch';
const SENDER_NAME        = 'Propus Codestudio';
const MAX_FIELD_BYTES    = 5000;
const MAX_TOTAL_BYTES    = 20000;
const SECRETS_FILE       = '/etc/codestudio/secrets.env';
const TURNSTILE_VERIFY   = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
const TURNSTILE_TIMEOUT  = 6; // seconds

/**
 * Bug-Hunt MEDIUM M05: server-seitiges Rate-Limit pro IP. Honeypot +
 * Cloudflare-Turnstile decken Bots ab; ohne weiteren Cap koennte ein
 * Mensch (oder Turnstile-Bypass mit rotierenden IPs) die Inbox
 * codestudio@propus.ch fluten. File-basiertes Bucket-Counting in
 * sys_get_temp_dir() — kein DB- oder Redis-Setup noetig, lock via flock.
 */
const RATE_LIMIT_PER_HOUR = 5;
const RATE_LIMIT_PER_DAY  = 20;
const RATE_LIMIT_DIR_NAME = 'codestudio-contact-ratelimit';

function fail(int $status, string $message): void
{
    http_response_code($status);
    echo json_encode(['ok' => false, 'error' => $message], JSON_UNESCAPED_UNICODE);
    exit;
}

function clean(?string $value): string
{
    if ($value === null) {
        return '';
    }
    $value = str_replace(["\r\n", "\r"], "\n", $value);
    $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? '';
    return trim($value);
}

function sanitize_header(string $value): string
{
    return trim(preg_replace('/[\r\n\t]+/', ' ', $value) ?? '');
}

function load_secret(string $key): ?string
{
    if (!is_readable(SECRETS_FILE)) {
        return null;
    }
    $lines = @file(SECRETS_FILE, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    foreach ($lines as $line) {
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        $parts = explode('=', $line, 2);
        if (count($parts) === 2 && trim($parts[0]) === $key) {
            return trim($parts[1], " \t\"'");
        }
    }
    return null;
}

/**
 * @return array{allowed: bool, hour: int, day: int}
 *   `allowed` = false sobald hour- oder day-Cap erreicht ist (vor Increment).
 *   Failures (kein Schreibrecht etc.) failen offen — Rate-Limit ist
 *   defense-in-depth, nicht Pflicht-Gate.
 */
function check_rate_limit(string $ip): array
{
    $allowed = ['allowed' => true, 'hour' => 0, 'day' => 0];
    if ($ip === '') {
        return $allowed; // ohne IP koennen wir nichts buchen — dann nicht blocken
    }

    $dir = rtrim(sys_get_temp_dir(), '/\\') . DIRECTORY_SEPARATOR . RATE_LIMIT_DIR_NAME;
    if (!is_dir($dir)) {
        if (!@mkdir($dir, 0700, true) && !is_dir($dir)) {
            return $allowed; // kein Verzeichnis — fail open
        }
    }

    // Filename: SHA1 der IP, damit wir keine rohen IPs auf der Platte haben
    // und keine Path-Traversal-Risiken durch komische IPv6-Zeichen.
    $bucket = $dir . DIRECTORY_SEPARATOR . sha1($ip) . '.json';
    $fp = @fopen($bucket, 'c+');
    if ($fp === false) {
        return $allowed;
    }
    try {
        if (!flock($fp, LOCK_EX)) {
            return $allowed;
        }
        $raw = stream_get_contents($fp) ?: '';
        $state = json_decode($raw, true);
        if (!is_array($state)) {
            $state = [];
        }
        $now = time();
        $entries = isset($state['entries']) && is_array($state['entries']) ? $state['entries'] : [];
        // Eintraege aelter als 24h verwerfen — verhindert unbegrenztes Wachstum.
        $entries = array_values(array_filter(
            $entries,
            static fn ($t) => is_int($t) && ($now - $t) < 86400,
        ));

        $hourCount = 0;
        $dayCount = count($entries);
        foreach ($entries as $t) {
            if (($now - $t) < 3600) {
                $hourCount++;
            }
        }

        if ($hourCount >= RATE_LIMIT_PER_HOUR || $dayCount >= RATE_LIMIT_PER_DAY) {
            // Persistenz NICHT erweitern, damit Angreifer den Counter nicht
            // mit Spam-Requests selbst weiterticken kann.
            return ['allowed' => false, 'hour' => $hourCount, 'day' => $dayCount];
        }

        // Increment + persistieren
        $entries[] = $now;
        $state['entries'] = $entries;
        rewind($fp);
        ftruncate($fp, 0);
        fwrite($fp, (string) json_encode($state));
        return ['allowed' => true, 'hour' => $hourCount + 1, 'day' => $dayCount + 1];
    } finally {
        flock($fp, LOCK_UN);
        fclose($fp);
    }
}

function verify_turnstile(string $token, string $secret, string $remoteIp): array
{
    $payload = http_build_query([
        'secret'   => $secret,
        'response' => $token,
        'remoteip' => $remoteIp,
    ]);

    $ctx = stream_context_create([
        'http' => [
            'method'        => 'POST',
            'header'        => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content'       => $payload,
            'timeout'       => TURNSTILE_TIMEOUT,
            'ignore_errors' => true,
        ],
    ]);

    $raw = @file_get_contents(TURNSTILE_VERIFY, false, $ctx);
    if ($raw === false) {
        return ['success' => false, 'error-codes' => ['network-error']];
    }
    $json = json_decode($raw, true);
    if (!is_array($json)) {
        return ['success' => false, 'error-codes' => ['invalid-json']];
    }
    return $json;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail(405, 'Method not allowed');
}

if ((int) ($_SERVER['CONTENT_LENGTH'] ?? 0) > MAX_TOTAL_BYTES) {
    fail(413, 'Anfrage zu gross');
}

// Honeypot – darf nicht ausgefüllt sein.
if (clean($_POST['website'] ?? '') !== '') {
    echo json_encode(['ok' => true]);
    exit;
}

$name        = clean($_POST['name']         ?? '');
$email       = clean($_POST['email']        ?? '');
$company     = clean($_POST['company']      ?? '');
$projectType = clean($_POST['project-type'] ?? '');
$budget      = clean($_POST['budget']       ?? '');
$message     = clean($_POST['message']      ?? '');

foreach (['name' => $name, 'email' => $email, 'message' => $message] as $field => $value) {
    if ($value === '') {
        fail(422, sprintf('Pflichtfeld fehlt: %s', $field));
    }
    if (strlen($value) > MAX_FIELD_BYTES) {
        fail(422, sprintf('Feld "%s" ist zu lang', $field));
    }
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    fail(422, 'E-Mail-Adresse ungültig');
}

$ip = $_SERVER['HTTP_CF_CONNECTING_IP'] ?? $_SERVER['REMOTE_ADDR'] ?? '';

// Bug-Hunt MEDIUM M05: vor Turnstile-Verify pruefen, damit blockierte
// IPs uns nicht das Cloudflare-Quota verbrennen.
$rateLimit = check_rate_limit($ip);
if (!$rateLimit['allowed']) {
    error_log(sprintf(
        'codestudio contact: rate limit hit for ip-hash=%s (hour=%d, day=%d)',
        $ip !== '' ? sha1($ip) : 'unknown',
        $rateLimit['hour'],
        $rateLimit['day'],
    ));
    http_response_code(429);
    echo json_encode([
        'ok' => false,
        'error' => 'Zu viele Anfragen von dieser Adresse. Bitte spaeter erneut versuchen oder direkt an codestudio@propus.ch schreiben.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

$turnstileSecret = load_secret('TURNSTILE_SECRET_KEY');
if ($turnstileSecret === null || $turnstileSecret === '') {
    error_log('codestudio contact: TURNSTILE_SECRET_KEY missing in ' . SECRETS_FILE);
    fail(500, 'Server-Konfiguration unvollständig');
}

$turnstileToken = clean($_POST['cf-turnstile-response'] ?? '');
if ($turnstileToken === '') {
    fail(403, 'Bot-Schutz fehlgeschlagen – bitte Seite neu laden und erneut absenden.');
}

$ts = verify_turnstile($turnstileToken, $turnstileSecret, $ip);
if (empty($ts['success'])) {
    error_log('codestudio contact: turnstile rejected ' . json_encode($ts['error-codes'] ?? []));
    fail(403, 'Bot-Schutz fehlgeschlagen – bitte Seite neu laden und erneut absenden.');
}

$labelType = [
    'landingpage' => 'Landingpage',
    'website'     => 'Website',
    'tool'        => 'Tool / Backpanel',
    'custom'      => 'Custom Software',
    'other'       => 'Etwas anderes',
][$projectType] ?? ($projectType !== '' ? $projectType : '–');

$labelBudget = [
    'lt-2k'  => 'Unter CHF 2\'000',
    '2-5k'   => 'CHF 2\'000 – 5\'000',
    '5-10k'  => 'CHF 5\'000 – 10\'000',
    '10-25k' => 'CHF 10\'000 – 25\'000',
    'gt-25k' => 'Über CHF 25\'000',
    'unsure' => 'Noch unklar',
][$budget] ?? ($budget !== '' ? $budget : '–');

$ipForLog  = $ip !== '' ? $ip : '–';
$userAgent = sanitize_header($_SERVER['HTTP_USER_AGENT'] ?? '–');
$timestamp = (new DateTimeImmutable('now', new DateTimeZone('Europe/Zurich')))
    ->format('Y-m-d H:i:s T');

$body = "Neue Anfrage über codestudio.propus.ch\n"
      . str_repeat('=', 48) . "\n\n"
      . "Name:        $name\n"
      . "E-Mail:      $email\n"
      . "Firma:       " . ($company !== '' ? $company : '–') . "\n"
      . "Projekttyp:  $labelType\n"
      . "Budget:      $labelBudget\n\n"
      . "Nachricht:\n"
      . str_repeat('-', 48) . "\n"
      . $message . "\n"
      . str_repeat('-', 48) . "\n\n"
      . "Eingegangen: $timestamp\n"
      . "IP:          $ipForLog\n"
      . "User-Agent:  $userAgent\n";

$subject = sanitize_header(sprintf('Codestudio-Anfrage von %s', $name));

$boundaryFrom = sprintf('%s <%s>', SENDER_NAME, SENDER_EMAIL);
$replyTo      = sanitize_header(sprintf('%s <%s>', $name, $email));

$headers = [
    'From'                      => $boundaryFrom,
    'Reply-To'                  => $replyTo,
    'X-Mailer'                  => 'codestudio.propus.ch contact form',
    'X-Originating-IP'          => $ipForLog,
    'MIME-Version'              => '1.0',
    'Content-Type'              => 'text/plain; charset=UTF-8',
    'Content-Transfer-Encoding' => '8bit',
];

$headerLines = [];
foreach ($headers as $key => $value) {
    $headerLines[] = "$key: " . sanitize_header((string) $value);
}

$additionalParams = '-f ' . escapeshellarg(SENDER_EMAIL);

$ok = mail(RECIPIENT, $subject, $body, implode("\r\n", $headerLines), $additionalParams);

if (!$ok) {
    error_log('codestudio contact form: mail() returned false');
    fail(502, 'Mail konnte nicht zugestellt werden');
}

echo json_encode(['ok' => true]);
