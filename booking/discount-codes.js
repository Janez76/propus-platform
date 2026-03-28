// ==============================
// Rabattcode-Konfiguration
// ==============================

/**
 * Rabattcode-Konfiguration
 * Format: { "CODE": prozentualer_Rabatt }
 * 
 * Beispiel:
 * - "TEST": 10 bedeutet 10% Rabatt
 * - "SUMMER20": 20 bedeutet 20% Rabatt
 */
const DISCOUNT_CODES = {
  // Test-Code
  "TEST": 10,
  
  // Beispiel-Codes (können später durch API ersetzt werden)
  "WELCOME10": 10,
  "SUMMER20": 20,
  "VIP15": 15,
  "EARLYBIRD": 25,
  "LOYALTY": 5
};

/**
 * Validiert einen Rabattcode und gibt den Rabatt-Prozentsatz zurück
 * @param {string} code - Der eingegebene Rabattcode
 * @returns {number|null} - Der Rabatt-Prozentsatz oder null wenn ungültig
 */
function validateDiscountCode(code) {
  if (!code || typeof code !== 'string') {
    return null;
  }
  
  const normalizedCode = code.trim().toUpperCase();
  return DISCOUNT_CODES[normalizedCode] || null;
}

/**
 * Berechnet den Rabattbetrag basierend auf dem Subtotal und Rabattcode
 * @param {string} code - Der Rabattcode
 * @param {number} subtotal - Der Zwischensummen-Betrag
 * @returns {Object} - { percent: number, amount: number } oder null
 */
function calculateDiscount(code, subtotal) {
  const percent = validateDiscountCode(code);
  
  if (percent === null || subtotal <= 0) {
    return null;
  }
  
  const amount = subtotal * (percent / 100);
  
  return {
    percent: percent,
    amount: amount
  };
}

// Export für Verwendung in anderen Dateien
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DISCOUNT_CODES,
    validateDiscountCode,
    calculateDiscount
  };
}
