const TOKEN_ID = '376b343df70ccedb';
const TOKEN_SECRET = 'f7b7ca7505d661211791205100c7a65c';
const auth = 'Basic ' + Buffer.from(TOKEN_ID + ':' + TOKEN_SECRET).toString('base64');

const tours = [
  { id: 22,  spaceId: 'qQLhGqF6ihH', name: '3.5 Zimmer-Wohnung Effretikon' },
  { id: 27,  spaceId: '484eqeu9QuY', name: '2.5 Zimmer WH. in Ebikon' },
  { id: 57,  spaceId: 'pSnND4v2YCC', name: 'Dreifamilienhaus, 9428 Walzenhausen' },
  { id: 62,  spaceId: 'DmUQr24dMxH', name: 'EFH 8630 Rüti' },
  { id: 67,  spaceId: 'P4HD3v5ZVBg', name: 'EFH, 6.5 Zimmer, 220 m2 mit Garten' },
  { id: 70,  spaceId: 'LF7Jb9RDwSG', name: 'Eigentumswohnung inkl. Garage 67 m2' },
  { id: 71,  spaceId: 'wGGxYrve5sy', name: 'Eigentumswohnung, 3.5 Zimmer, 110 m2' },
  { id: 78,  spaceId: '6sAaw8agPnA', name: 'ETW, 3.5 Zimmer, 99m2' },
  { id: 79,  spaceId: 'zHUYYdn97bc', name: 'ETW, 4.5 Zimmer, 119 m2' },
  { id: 100, spaceId: 'pxaPHUfFnaD', name: 'Neugonzenbach 8' },
  { id: 103, spaceId: 'cjQXymv77X7', name: 'Piazza Santeramo 1' },
  { id: 105, spaceId: 'yiiMa5cb4F6', name: 'Rautistrasse 6' },
  { id: 109, spaceId: '3ATGX3SCAzX', name: 'Sandblatte 3a' },
  { id: 110, spaceId: 'XrPFgqAeiDC', name: 'Sandstrasse 1' },
  { id: 114, spaceId: '4oKQa3xuLKi', name: 'Sternenhalde 9' },
  { id: 120, spaceId: 'wnRAPxwXkF9', name: 'Weierwiesstrasse 2' },
  { id: 122, spaceId: 'GJ8BqcgYgMN', name: 'Widenacker 14' },
];

async function getAddress(tour) {
  const query = `query { model(id: "${tour.spaceId}") { id name publication { address } } }`;
  try {
    const res = await fetch('https://api.matterport.com/api/models/graph', {
      method: 'POST',
      headers: { 'Authorization': auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const json = await res.json();
    const address = json?.data?.model?.publication?.address || '(keine Adresse hinterlegt)';
    return { ...tour, address };
  } catch (e) {
    return { ...tour, address: 'FEHLER: ' + e.message };
  }
}

const results = await Promise.all(tours.map(getAddress));
results.forEach(r => {
  console.log(`Tour #${r.id} | ${r.name} | ${r.address}`);
});
