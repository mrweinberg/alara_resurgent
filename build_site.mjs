import fs from "node:fs";
import path from "node:path";

// ==========================================
// 1. CONFIGURATION
// ==========================================

const INPUT_FILE = "alara_design_bible.txt";
const IMAGE_DIR = "alara_art_output";
const OUTPUT_FILE = "index.html";

// ==========================================
// 2. HELPER: CONTENT DETECTION
// ==========================================

function isRuleLine(line) {
  if (line.includes("{") || line.includes("}")) return true;
  if (line.match(/^[A-Z][a-z]+ —/)) return true;
  if (line.match(/^[A-Z][a-z]+\s\d+$/)) return true;

  const mechanics = [
    "target", "battlefield", "graveyard", "library", "exile", 
    "damage", "life", "counter", "token", "create", "sacrifice",
    "destroy", "draw", "discard", "tap", "untap", "equip", "attach",
    "cast", "activate", "enter", "leaves", "die", "regenerate",
    "fight", "scry", "mill", "look", "reveal", "shuffle",
    "flying", "haste", "trample", "vigilance", "first strike", 
    "double strike", "deathtouch", "reach", "lifelink", "hexproof",
    "ward", "protection", "flash", "defender", "+1/+1", "-1/-1",
    "fabricate", "cascade", "exalted", "affinity", "replicate", "storm",
    "cycling", "fear", "intimidate", "landwalk", "shroud"
  ];

  const lower = line.toLowerCase();
  return mechanics.some(term => lower.includes(term));
}

// ==========================================
// 3. CLASS DEFINITION
// ==========================================

class Card {
  constructor() {
    this.id = "";
    this.name = "";
    this.cost = "";
    this.type = "";
    this.text = [];
    this.flavor = []; 
  }

  getRarityClass() {
    if (!this.id) return "common";
    const code = this.id.charAt(0).toUpperCase();
    if (code === 'M') return "mythic";
    if (code === 'R') return "rare";
    if (code === 'U') return "uncommon";
    if (code === 'L') return "land"; 
    return "common";
  }
  
  formatSymbols(text) {
    if (!text) return "";
    return text.replace(/\{([A-Z0-9/]+)\}/g, (match, symbol) => {
      let cleanSymbol = symbol.replace("/", "").toLowerCase();
      if (cleanSymbol === 't') cleanSymbol = 'tap';
      if (cleanSymbol === 'q') cleanSymbol = 'untap';
      return `<i class="ms ms-${cleanSymbol} ms-cost"></i>`;
    });
  }

  getFormattedCost() {
    return this.formatSymbols(this.cost);
  }

  getFormattedText() {
    return this.text.map(line => {
        let formatted = this.formatSymbols(line);
        formatted = formatted.replace(/^([a-zA-Z\s]+(?:\s\d+)?)( —|:)/, '<strong>$1</strong>$2');
        formatted = formatted.replace(/^([a-zA-Z]+) —/g, '<i>$1</i> —');
        return `<p>${formatted}</p>`;
    }).join("");
  }
  
  getFormattedFlavor() {
      if (this.flavor.length === 0) return "";
      return this.flavor.map(line => `<p>${line}</p>`).join("");
  }

  getFileName() {
    const safeName = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    return this.id ? `${this.id}_${safeName}.png` : `${safeName}.png`;
  }
}

// ==========================================
// 4. PARSING LOGIC
// ==========================================

function parseDesignBible(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  
  const cards = [];
  const setInfo = {
    flavor: [],
    mechanics: []
  };

  let currentIdLine = null;
  let currentBuffer = []; 
  let parsingSection = "INTRO"; 

  const sourceTagRegex = /^\\s*/;
  const idTagRegex = /^\[([A-Z0-9]+)\]\s+(.+?)(?:\s+(\{.*\})\s*)?$/;

  const finalizeCard = (idLineMatch, bodyLines) => {
      const card = new Card();
      card.id = idLineMatch[1];
      card.name = idLineMatch[2];
      card.cost = idLineMatch[3] || "";

      const cleanBody = bodyLines.filter(l => l.trim().length > 0);
      
      if (cleanBody.length > 0) {
          card.type = cleanBody[0]; 
          
          const remaining = cleanBody.slice(1);
          let processingFlavor = true;
          const rulesStack = [];
          const flavorStack = [];

          for (let i = remaining.length - 1; i >= 0; i--) {
              const line = remaining[i];
              if (line.startsWith("“") || line.startsWith('"')) {
                  flavorStack.unshift(line);
                  continue; 
              }
              if (isRuleLine(line)) {
                  processingFlavor = false;
              }
              if (processingFlavor) {
                  flavorStack.unshift(line);
              } else {
                  rulesStack.unshift(line);
              }
          }
          card.text = rulesStack;
          card.flavor = flavorStack;
      }
      return card;
  };

  lines.forEach(line => {
    let cleanLine = line.replace(sourceTagRegex, '').trim();
    if (!cleanLine) return;

    if (cleanLine.includes("1. FLAVOR & WORLD")) { parsingSection = "FLAVOR"; return; }
    if (cleanLine.includes("2. MECHANICAL IDENTITIES")) { parsingSection = "MECHANICS"; return; }
    if (cleanLine.includes("3. CARD FILE")) { parsingSection = "CARDS"; return; }

    if (parsingSection === "FLAVOR") {
        setInfo.flavor.push(cleanLine);
    } else if (parsingSection === "MECHANICS") {
        setInfo.mechanics.push(cleanLine);
    } else if (parsingSection === "CARDS") {
        const match = cleanLine.match(idTagRegex);
        
        if (match || cleanLine.match(/^\[[A-Z]+\d+\]/)) {
            if (currentIdLine) {
                cards.push(finalizeCard(currentIdLine, currentBuffer));
            }
            if (match) {
                currentIdLine = match;
            } else {
                 currentIdLine = [null, "UNKNOWN", cleanLine, ""];
            }
            currentBuffer = [];
        } else {
            if (currentIdLine) {
                currentBuffer.push(cleanLine);
            }
        }
    }
  });

  if (currentIdLine) {
      cards.push(finalizeCard(currentIdLine, currentBuffer));
  }

  return { cards, setInfo };
}

// ==========================================
// 5. HTML GENERATION
// ==========================================

function generateHTML(cards, setInfo) {
  const mechanicsHTML = setInfo.mechanics.map(line => {
      const formatted = line.replace(/^\*\s*(.+?):/, '<strong>$1:</strong>');
      return `<li>${formatted.replace(/^\*\s*/, '')}</li>`;
  }).join("");

  const flavorHTML = setInfo.flavor.map(line => `<p>${line}</p>`).join("");

  const cardElements = cards.map(card => {
    const imagePath = `${IMAGE_DIR}/${card.getFileName()}`;
    const rarityClass = card.getRarityClass();
    
    // Color detection
    let colorClass = "colorless";
    const c = card.cost || "";
    const colors = [];
    if (c.includes("W")) colors.push("W");
    if (c.includes("U")) colors.push("U");
    if (c.includes("B")) colors.push("B");
    if (c.includes("R")) colors.push("R");
    if (c.includes("G")) colors.push("G");

    if (colors.length > 1) colorClass = "gold";
    else if (colors.includes("W")) colorClass = "white";
    else if (colors.includes("U")) colorClass = "blue";
    else if (colors.includes("B")) colorClass = "black";
    else if (colors.includes("R")) colorClass = "red";
    else if (colors.includes("G")) colorClass = "green";
    
    if (card.type.toLowerCase().includes("land")) colorClass = "land";
    if (card.type.toLowerCase().includes("artifact") && colors.length === 0) colorClass = "artifact";

    return `
      <div class="card-container ${colorClass}" 
           data-name="${card.name.toLowerCase()}" 
           data-type="${card.type.toLowerCase()}" 
           data-text="${card.text.join(' ').toLowerCase()}"
           data-rarity="${rarityClass}">
        <div class="card-image-wrapper" onclick="openModal('${imagePath}', '${card.name}')">
          <img src="${imagePath}" alt="${card.name}" loading="lazy" onerror="this.src='https://placehold.co/400x320?text=Generating...'; this.style.opacity=0.5;">
          <div class="zoom-hint">🔍</div>
        </div>
        <div class="card-data">
          <div class="card-header">
            <div class="card-name" title="${card.name}">${card.name}</div>
            <div class="card-cost">${card.getFormattedCost()}</div>
          </div>
          <div class="card-type-line">
            ${card.type}
            <span class="rarity-indicator ${rarityClass}" title="${rarityClass}"></span>
          </div>
          <div class="card-text-box">
            ${card.getFormattedText()}
            ${card.flavor.length > 0 ? `<div class="card-flavor">${card.getFormattedFlavor()}</div>` : ''}
          </div>
          <div class="card-footer">
            <span class="card-id ${rarityClass}">#${card.id}</span>
          </div>
        </div>
      </div>
    `;
  }).join("");

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Alara Resurgent Spoiler</title>
  <link href="https://cdn.jsdelivr.net/npm/mana-font@latest/css/mana.min.css" rel="stylesheet" type="text/css" />
  <style>
    :root {
      --bg: #111;
      --surface: #222;
      --border: #444;
      --text: #eee;
      --text-dim: #aaa;
      --accent: #d4a017;
      
      /* Rarity Colors */
      --r-mythic: #ff8400;
      --r-rare: #eecf73;
      --r-uncommon: #c0c0c0;
      --r-common: #ffffff;
      --r-land: #d8b8ff;
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; }
    
    header { max-width: 900px; margin: 0 auto 50px auto; text-align: center; }
    h1 { text-transform: uppercase; letter-spacing: 3px; margin-bottom: 10px; font-size: 2.5em; border-bottom: 2px solid var(--accent); display: inline-block; padding-bottom: 10px; }
    
    .info-section { 
        background: var(--surface); 
        border: 1px solid var(--border); 
        border-radius: 8px; 
        padding: 20px; 
        text-align: left; 
        margin-top: 30px;
    }
    .info-section h2 { margin-top: 0; color: var(--accent); font-size: 1.2em; border-bottom: 1px solid #444; padding-bottom: 5px; }
    .info-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 30px; }
    @media (max-width: 768px) { .info-cols { grid-template-columns: 1fr; } }
    
    .flavor-text p { font-style: italic; color: #ccc; line-height: 1.5; margin-bottom: 10px; }
    .mechanics-list ul { padding-left: 20px; margin: 0; }
    .mechanics-list li { margin-bottom: 8px; line-height: 1.4; color: #ddd; }
    .mechanics-list strong { color: #fff; }

    .controls { max-width: 600px; margin: 40px auto; }
    input#search { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid var(--border); background: #333; color: #fff; font-size: 16px; box-sizing: border-box; }

    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; max-width: 1400px; margin: 0 auto; }
    
    .card-container { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card-container:hover { transform: translateY(-5px); box-shadow: 0 10px 15px rgba(0,0,0,0.5); }

    /* IMAGE WRAPPER & ZOOM */
    .card-image-wrapper { 
        width: 100%; aspect-ratio: 5/4; background: #000; border-bottom: 4px solid #555; cursor: pointer; position: relative;
    }
    .card-image-wrapper img { width: 100%; height: 100%; object-fit: cover; }
    
    .zoom-hint {
        position: absolute; top: 10px; right: 10px; 
        background: rgba(0,0,0,0.7); color: white; 
        width: 30px; height: 30px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        opacity: 0; transition: opacity 0.2s; font-size: 14px;
    }
    .card-image-wrapper:hover .zoom-hint { opacity: 1; }

    /* Frame Colors */
    .card-container.white .card-image-wrapper { border-color: #F8F6D8; }
    .card-container.blue .card-image-wrapper { border-color: #C1D7E9; }
    .card-container.black .card-image-wrapper { border-color: #BAB1AB; }
    .card-container.red .card-image-wrapper { border-color: #E49977; }
    .card-container.green .card-image-wrapper { border-color: #A3C095; }
    .card-container.gold .card-image-wrapper { border-color: #E6C265; }
    .card-container.artifact .card-image-wrapper { border-color: #9EAEB8; }
    .card-container.land .card-image-wrapper { border-color: #BFA586; }

    .card-data { padding: 16px; display: flex; flex-direction: column; flex-grow: 1; }
    
    /* HEADER: WRAPPING ALLOWED */
    .card-header { 
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 10px; margin-bottom: 8px; font-weight: bold; font-size: 1.1em; 
    }
    .card-name { flex: 1; word-wrap: break-word; line-height: 1.25; }
    .card-cost { flex: 0 0 auto; text-align: right; margin-top: 2px; white-space: nowrap; }

    .card-type-line { 
        font-size: 0.85em; font-weight: 600; color: var(--text-dim); 
        margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #444; 
        display: flex; justify-content: space-between; align-items: center;
    }
    .rarity-indicator {
        width: 12px; height: 12px; border-radius: 50%; display: inline-block; box-shadow: 0 0 2px rgba(0,0,0,0.5);
    }
    
    .card-text-box { font-size: 0.95em; line-height: 1.4; flex-grow: 1; }
    .card-text-box p { margin: 0 0 6px 0; }
    .card-flavor { margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.15); font-style: italic; font-family: 'Georgia', serif; color: #bbb; font-size: 0.9em; }
    .card-flavor p { margin: 0 0 4px 0; }
    .card-footer { margin-top: 10px; text-align: right; font-size: 0.75em; color: #666; font-family: monospace; }
    
    .rarity-indicator.mythic, .card-id.mythic { color: var(--r-mythic); background-color: var(--r-mythic); }
    .rarity-indicator.rare, .card-id.rare { color: var(--r-rare); background-color: var(--r-rare); }
    .rarity-indicator.uncommon, .card-id.uncommon { color: var(--r-uncommon); background-color: var(--r-uncommon); }
    .rarity-indicator.common, .card-id.common { color: var(--r-common); background-color: var(--r-common); }
    .rarity-indicator.land, .card-id.land { color: var(--r-land); background-color: var(--r-land); }
    span.card-id { background-color: transparent !important; }

    .ms-cost { font-size: 0.85em; margin: 0 1px; vertical-align: middle; }

    /* MODAL */
    .modal {
        display: none; position: fixed; z-index: 1000; left: 0; top: 0;
        width: 100%; height: 100%; overflow: hidden;
        background-color: rgba(0,0,0,0.9);
        backdrop-filter: blur(5px);
    }
    .modal-content {
        margin: auto; display: block;
        max-width: 90%; max-height: 90vh;
        width: auto; height: auto;
        position: absolute; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        border: 2px solid #333;
        box-shadow: 0 0 50px rgba(0,0,0,0.8);
    }
    .modal-caption {
        position: absolute; bottom: 20px; width: 100%; text-align: center; color: white; font-size: 1.2em; font-weight: bold; pointer-events: none;
    }
    .close {
        position: absolute; top: 20px; right: 30px;
        color: #f1f1f1; font-size: 40px; font-weight: bold;
        transition: 0.3s; cursor: pointer; z-index: 1001;
    }
    .close:hover { color: #bbb; }
  </style>
</head>
<body>

  <header>
    <h1>Alara Resurgent</h1>
    <div class="info-section">
      <div class="info-cols">
        <div class="flavor-text">
          <h2>The World</h2>
          ${flavorHTML}
        </div>
        <div class="mechanics-list">
          <h2>Mechanical Identities</h2>
          <ul>${mechanicsHTML}</ul>
        </div>
      </div>
    </div>
  </header>

  <div class="controls"><input type="text" id="search" placeholder="Filter by Name, Type, Rules, or Rarity (e.g. 'Mythic')..." onkeyup="filterCards()"></div>
  <div class="gallery" id="gallery">${cardElements}</div>

  <div id="imageModal" class="modal" onclick="closeModal()">
    <span class="close">&times;</span>
    <img class="modal-content" id="modalImg">
    <div class="modal-caption" id="caption"></div>
  </div>

  <script>
    function filterCards() {
      const v = document.getElementById('search').value.toLowerCase();
      const c = document.getElementsByClassName('card-container');
      for (let i=0; i<c.length; i++) {
        // Now includes dataset.rarity in the search
        const txt = (
            c[i].dataset.name + " " + 
            c[i].dataset.type + " " + 
            c[i].dataset.text + " " + 
            c[i].dataset.rarity
        ).toLowerCase();
        c[i].style.display = txt.includes(v) ? "flex" : "none";
      }
    }

    // Modal Logic
    const modal = document.getElementById("imageModal");
    const modalImg = document.getElementById("modalImg");
    const captionText = document.getElementById("caption");

    function openModal(src, alt) {
      modal.style.display = "block";
      modalImg.src = src;
      captionText.innerHTML = alt;
      document.body.style.overflow = "hidden"; // Prevent scrolling
    }

    function closeModal() {
      modal.style.display = "none";
      document.body.style.overflow = "auto"; // Re-enable scrolling
    }
    
    // Close on Escape key
    document.addEventListener('keydown', function(event) {
        if(event.key === "Escape") {
            closeModal();
        }
    });
  </script>
</body>
</html>
  `;
}

// ==========================================
// 6. MAIN EXECUTION
// ==========================================

function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: ${INPUT_FILE} not found.`);
    return;
  }
  
  console.log("📖 Parsing Design Bible (Flavor + Mechanics + Cards)...");
  const data = parseDesignBible(INPUT_FILE);
  console.log(`   Found ${data.setInfo.mechanics.length} mechanics and ${data.cards.length} cards.`);
  
  fs.writeFileSync(OUTPUT_FILE, generateHTML(data.cards, data.setInfo));
  console.log(`✅ Generated ${OUTPUT_FILE}`);
}

main();