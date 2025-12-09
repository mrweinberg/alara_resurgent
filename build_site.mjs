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

// Returns true if the line contains strong evidence of being a Rule (mechanics)
function isRuleLine(line) {
  // 1. Check for Mana Symbols or Activation Costs ({T}, {1}{R})
  if (line.includes("{") || line.includes("}")) return true;

  // 2. Check for Ability Words (Word — Effect)
  if (line.match(/^[A-Z][a-z]+ —/)) return true;
  
  // 3. Check for "Keyword N" pattern (e.g., "Fabricate 2", "Equip 3", "Crew 2")
  if (line.match(/^[A-Z][a-z]+\s\d+$/)) return true;

  // 4. Check for specific mechanical keywords/terms
  const mechanics = [
    "target", "battlefield", "graveyard", "library", "exile", 
    "damage", "life", "counter", "token", "create", "sacrifice",
    "destroy", "draw", "discard", "tap", "untap", "equip", "attach",
    "cast", "activate", "enter", "leaves", "die", "regenerate",
    "fight", "scry", "mill", "look", "reveal", "shuffle",
    "flying", "haste", "trample", "vigilance", "first strike", 
    "double strike", "deathtouch", "reach", "lifelink", "hexproof",
    "ward", "protection", "flash", "defender", "+1/+1", "-1/-1",
    // Alara/Set Specific Keywords
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
  
  // Helper to process symbols like {T} -> ms-tap
  formatSymbols(text) {
    if (!text) return "";
    return text.replace(/\{([A-Z0-9/]+)\}/g, (match, symbol) => {
      let cleanSymbol = symbol.replace("/", "").toLowerCase();
      
      // FIX: Map 't' to 'tap' and 'q' to 'untap' for the CSS font
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
        // 1. Format Symbols
        let formatted = this.formatSymbols(line);
        
        // 2. Bold keywords (Start of line before colon or dash)
        formatted = formatted.replace(/^([a-zA-Z\s]+(?:\s\d+)?)( —|:)/, '<strong>$1</strong>$2');
        
        // 3. Italicize Ability Words at start of line
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
  
  let currentIdLine = null;
  let currentBuffer = []; 

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

          // Bottom-up scan to separate flavor from rules
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
    const cleanLine = line.replace(sourceTagRegex, '').trim();
    if (!cleanLine) return;

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
  });

  if (currentIdLine) {
      cards.push(finalizeCard(currentIdLine, currentBuffer));
  }

  return cards;
}

// ==========================================
// 5. HTML GENERATION
// ==========================================

function generateHTML(cards) {
  const cardElements = cards.map(card => {
    const imagePath = `${IMAGE_DIR}/${card.getFileName()}`;
    
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
      <div class="card-container ${colorClass}" data-name="${card.name.toLowerCase()}" data-type="${card.type.toLowerCase()}" data-text="${card.text.join(' ').toLowerCase()}">
        <div class="card-image-wrapper">
          <img src="${imagePath}" alt="${card.name}" loading="lazy" onerror="this.src='https://placehold.co/400x320?text=Generating...'; this.style.opacity=0.5;">
        </div>
        <div class="card-data">
          <div class="card-header">
            <div class="card-name">${card.name}</div>
            <div class="card-cost">${card.getFormattedCost()}</div>
          </div>
          <div class="card-type-line">${card.type}</div>
          <div class="card-text-box">
            ${card.getFormattedText()}
            ${card.flavor.length > 0 ? `<div class="card-flavor">${card.getFormattedFlavor()}</div>` : ''}
          </div>
          <div class="card-footer">
            <span class="card-id">#${card.id}</span>
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
    }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: var(--bg); color: var(--text); padding: 40px 20px; }
    h1 { text-align: center; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 40px; }
    
    .controls { max-width: 600px; margin: 0 auto 40px auto; }
    input#search { width: 100%; padding: 12px; border-radius: 6px; border: 1px solid var(--border); background: #333; color: #fff; font-size: 16px; box-sizing: border-box; }

    .gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 24px; max-width: 1400px; margin: 0 auto; }
    
    .card-container { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; overflow: hidden; display: flex; flex-direction: column; transition: transform 0.2s, box-shadow 0.2s; box-shadow: 0 4px 6px rgba(0,0,0,0.3); }
    .card-container:hover { transform: translateY(-5px); box-shadow: 0 10px 15px rgba(0,0,0,0.5); }

    .card-image-wrapper { width: 100%; aspect-ratio: 5/4; background: #000; border-bottom: 4px solid #555; }
    .card-image-wrapper img { width: 100%; height: 100%; object-fit: cover; }

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
    .card-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; font-weight: bold; font-size: 1.1em; }
    .card-type-line { font-size: 0.85em; font-weight: 600; color: var(--text-dim); margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #444; }
    
    .card-text-box { font-size: 0.95em; line-height: 1.4; flex-grow: 1; }
    .card-text-box p { margin: 0 0 6px 0; }
    
    /* FLAVOR TEXT STYLING */
    .card-flavor { 
        margin-top: 12px; 
        padding-top: 10px; 
        border-top: 1px solid rgba(255,255,255,0.15); 
        font-style: italic; 
        font-family: 'Georgia', serif; 
        color: #bbb;
        font-size: 0.9em;
    }
    .card-flavor p { margin: 0 0 4px 0; }

    .card-footer { margin-top: 10px; text-align: right; font-size: 0.75em; color: #666; font-family: monospace; }
    
    .ms-cost { font-size: 0.85em; margin: 0 1px; vertical-align: middle; }
  </style>
</head>
<body>
  <h1>Alara Resurgent</h1>
  <div class="controls"><input type="text" id="search" placeholder="Filter by Name, Type, or Rules..." onkeyup="filterCards()"></div>
  <div class="gallery" id="gallery">${cardElements}</div>
  <script>
    function filterCards() {
      const v = document.getElementById('search').value.toLowerCase();
      const c = document.getElementsByClassName('card-container');
      for (let i=0; i<c.length; i++) {
        const txt = (c[i].dataset.name + " " + c[i].dataset.type + " " + c[i].dataset.text).toLowerCase();
        c[i].style.display = txt.includes(v) ? "flex" : "none";
      }
    }
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
  
  console.log("📖 Parsing Design Bible with updated logic...");
  const cards = parseDesignBible(INPUT_FILE);
  console.log(`   Processed ${cards.length} cards.`);
  
  fs.writeFileSync(OUTPUT_FILE, generateHTML(cards));
  console.log(`✅ Generated ${OUTPUT_FILE}`);
}

main();