import { GoogleGenAI } from "@google/genai";
import fs from "node:fs";
import path from "node:path";
import 'dotenv/config';

// ==========================================
// 1. CONFIGURATION
// ==========================================

const API_KEY = process.env.GEMINI_API_KEY;

// UPDATED: Use the Gemini 3 model that supports "Output: Image" via generateContent.
//
const MODEL_ID = "gemini-3-pro-image-preview";

const INPUT_FILE = "alara_design_bible.txt";
const OUTPUT_DIR = "alara_art_output";

// ==========================================
// 2. CLASS DEFINITION
// ==========================================

class Card {
 constructor() {
    this.id = "";
    this.name = "";
    this.cost = "";
    this.type = "";
    this.text = [];
    this.flavor = "";
  }

  getColors() {
    const colors = [];
    if (this.cost && this.cost.includes("{W}")) colors.push("White");
    if (this.cost && this.cost.includes("{U}")) colors.push("Blue");
    if (this.cost && this.cost.includes("{B}")) colors.push("Black");
    if (this.cost && this.cost.includes("{R}")) colors.push("Red");
    if (this.cost && this.cost.includes("{G}")) colors.push("Green");
    return colors;
  }

  getCastingColors() {
    return this.getColors();
  }

  getColorIdentity() {
    const colors = new Set();
    const fullString = (this.cost + " " + this.text.join(" ")).toUpperCase();

    if (fullString.includes("{W}")) colors.add("White");
    if (fullString.includes("{U}")) colors.add("Blue");
    if (fullString.includes("{B}")) colors.add("Black");
    if (fullString.includes("{R}")) colors.add("Red");
    if (fullString.includes("{G}")) colors.add("Green");

    return Array.from(colors);
  }

  /**
   * Helper to generate the consistent filename for checking existence.
   */
  getFileName() {
    const safeName = this.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    // Filename includes ID (Rarity + Number) if available
    return this.id ? `${this.id}_${safeName}.png` : `${safeName}.png`;
  }

  getShardIdentity() {
    const nameLower = this.name.toLowerCase();
    const textLower = this.text.join(" ").toLowerCase();
    const typeLower = this.type.toLowerCase();
    const c = this.getColorIdentity();
    const colorCount = c.length;

    // 1. EXPLICIT NAME MATCHING
    if (nameLower.includes("esper"))  return "The Shard of Esper (Alara)";
    if (nameLower.includes("grixis")) return "The Shard of Grixis (Alara)";
    if (nameLower.includes("jund"))   return "The Shard of Jund (Alara)";
    if (nameLower.includes("naya"))   return "The Shard of Naya (Alara)";
    if (nameLower.includes("bant"))   return "The Shard of Bant (Alara)";

    // 2. MECHANICAL IDENTITY MATCHING
    if (textLower.includes("fabricate")) return "The Shard of Esper (Alara)";
    if (textLower.includes("covenant"))  return "The Shard of Bant (Alara)";
    if (textLower.includes("exhume"))    return "The Shard of Grixis (Alara)";
    if (textLower.includes("carnage"))   return "The Shard of Jund (Alara)";
    if (textLower.includes("titanic"))   return "The Shard of Naya (Alara)";
    if (textLower.includes("spectrum"))  return "The Conflux of Alara (Five-Color Energy)";

    // 3. COLOR IDENTITY MATCHING
    const hasW = c.includes("White");
    const hasU = c.includes("Blue");
    const hasB = c.includes("Black");
    const hasR = c.includes("Red");
    const hasG = c.includes("Green");

    if (colorCount === 3) {
      if (hasW && hasU && hasB) return "The Shard of Esper (Alara)";
      if (hasU && hasB && hasR) return "The Shard of Grixis (Alara)";
      if (hasB && hasR && hasG) return "The Shard of Jund (Alara)";
      if (hasR && hasG && hasW) return "The Shard of Naya (Alara)";
      if (hasG && hasW && hasU) return "The Shard of Bant (Alara)";
    }
    
    // Guild Mappings
    if (colorCount === 2) {
      if (hasW && hasU) return "The Shard of Esper (Alara) or Bant"; 
      if (hasU && hasB) return "The Shard of Esper (Alara) or Grixis";
      if (hasB && hasR) return "The Shard of Jund (Alara) or Grixis";
      if (hasR && hasG) return "The Shard of Jund (Alara) or Naya";
      if (hasG && hasW) return "The Shard of Bant (Alara) or Naya";
    }

    // 4. TYPE & FLAVOR FALLBACKS
    if (typeLower.includes("artifact")) return "The Shard of Esper (Alara)";
    if (typeLower.includes("zombie") || typeLower.includes("demon")) return "The Shard of Grixis (Alara)";
    if (typeLower.includes("dragon") || typeLower.includes("viashino") || typeLower.includes("goblin")) return "The Shard of Jund (Alara)";
    if (typeLower.includes("beast") || typeLower.includes("gargantuan")) return "The Shard of Naya (Alara)";
    if (typeLower.includes("angel") || typeLower.includes("soldier")) return "The Shard of Bant (Alara)";

    // 5. GENERIC FALLBACK
    if (colorCount >= 4) return "The Maelstrom of Alara (Chaotic Mana Storm)";
    return "The Plane of Alara"; 
  }

  generatePrompt() {
    const shard = this.getShardIdentity();
    const visualContext = this.flavor.length > 0 ? this.flavor : this.text.join(" ");
    const palette = this.getCastingColors().join(", ");
    
    // For Gemini 3, we simply ask it to generate the image in the prompt.
    return `
      Generate an image.
      Subject: A high-fidelity fantasy illustration for a Magic: The Gathering card named "${this.name}".
      Type: ${this.type}
      Context Description: "${visualContext}"
      
      Setting: Set in ${shard}. Use your knowledge of this MTG plane's visual identity. Not all elements of the shard need to be included; focus on creating a compelling and unique composition that reflects the shard's essence.
      
      Style: Official Magic: The Gathering art style. Choose from between a highly detailed oil painting or a vibrant digital illustration. If you feel it's appropriate, you may also incorporate elements of fantasy realism or surrealism.
      Though cards should be on a specific shard, some elements can be from other shards to show the new, unified world.
      Do not mock up the whole card frame, just the illustration. Feel free to be creative and stretch your imagination.
      Do not include any text boxes, borders, or logos—just the artwork. Do not include any mechanical elements like mana symbols, power/toughness boxes, or ability icons. Do not include +1/+1 anywhere in the art.
      Do not include any representations of Magic Cards themselves in the artwork, such as cards, card frames, or symbols.
      Color Palette: ${palette}. Not all colors need to be present; focus on composition and mood.
      Aspect Ratio: 5:4.
    `.trim();
  }
}

// ==========================================
// 3. PARSING LOGIC
// ==========================================

function parseDesignBible(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const cards = [];
  let currentCard = null;

  const sourceTagRegex = /^\\s*/;
  const idTagRegex = /^\[([A-Z0-9]+)\]\s+(.+?)(?:\s+(\{.*\})\s*)?$/;

  lines.forEach(line => {
    const cleanLine = line.replace(sourceTagRegex, '').trim();
    if (!cleanLine) return;

    const idMatch = cleanLine.match(idTagRegex);
    if (idMatch || cleanLine.match(/^\[[A-Z]+\d+\]/)) {
      if (currentCard) cards.push(currentCard);
      
      currentCard = new Card();
      if (idMatch) {
        currentCard.id = idMatch[1];
        currentCard.name = idMatch[2];
        currentCard.cost = idMatch[3] || "";
      } else {
        currentCard.name = cleanLine; 
      }
      return;
    }

    if (!currentCard) return;

    if (!currentCard.type) {
      currentCard.type = cleanLine;
    } else if (cleanLine.startsWith("“") || (cleanLine.endsWith(".") && !cleanLine.includes(":") && !cleanLine.includes("{"))) {
      currentCard.flavor += " " + cleanLine;
    } else {
      currentCard.text.push(cleanLine);
    }
  });

  if (currentCard) cards.push(currentCard);
  return cards;
}

// ==========================================
// 4. API INTERACTION
// ==========================================

async function generateArtForCard(aiClient, card) {
  const prompt = card.generatePrompt();
  const safeName = card.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  // UPDATED: Filename now includes the ID (Rarity + Number)
  // Example: M01_varrus_the_steel_sower.png
  const fileName = card.id ? `${card.id}_${safeName}.png` : `${safeName}.png`;
  const outputPath = path.join(OUTPUT_DIR, fileName);

  if (fs.existsSync(outputPath)) {
    console.log(`[SKIP] ${fileName} already exists.`);
    return;
  }

  console.log(`\n🎨 Generating: ${card.name} (${card.getShardIdentity()})`);

  try {
    // Call the model
    const response = await aiClient.models.generateContent({
      model: MODEL_ID,
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }]
        }
      ],
      // We do not set responseMimeType for image output models in this SDK
      // as they return mixed content (image parts).
    });

    // Extract Image Data
    // Gemini 3 returns images in the 'parts' array as inlineData
    let imageBase64 = null;
    
    // Check candidates
    const candidate = response.candidates?.[0];
    if (candidate && candidate.content && candidate.content.parts) {
      for (const part of candidate.content.parts) {
        // Look for inlineData (Base64)
        if (part.inlineData && part.inlineData.data) {
          imageBase64 = part.inlineData.data;
          break;
        }
        // Sometimes it might return a URI (executable code result)
        if (part.fileData && part.fileData.fileUri) {
             console.log("   -> Returned URI instead of Base64 (handle download if needed):", part.fileData.fileUri);
        }
      }
    }

    if (imageBase64) {
      fs.writeFileSync(outputPath, imageBase64, 'base64');
      console.log(`   ✅ Saved to ${outputPath}`);
    } else {
      console.error(`   ❌ Failed: No image data returned.`);
      // console.log(JSON.stringify(response, null, 2)); // Uncomment to debug
    }

  } catch (error) {
    console.error(`   ❌ API Error: ${error.message}`);
  }
}

// ==========================================
// 5. MAIN EXECUTION
// ==========================================

async function main() {
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`Error: Could not find ${INPUT_FILE}`);
    process.exit(1);
  }
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR);

  console.log("📖 Parsing Design Bible...");
  const allCards = parseDesignBible(INPUT_FILE);
  
  // PRE-FILTER STEP: Remove cards that already exist
  console.log("🔍 Checking for existing files...");
  
  const cardsToProcess = allCards.filter(card => {
    const fullPath = path.join(OUTPUT_DIR, card.getFileName());
    return !fs.existsSync(fullPath);
  });

  const skippedCount = allCards.length - cardsToProcess.length;
  console.log(`   Found ${allCards.length} total cards.`);
  if (skippedCount > 0) {
    console.log(`   ⏭️  Skipping ${skippedCount} cards that are already generated.`);
  }
  console.log(`   📝 Processing ${cardsToProcess.length} remaining cards.`);

  if (cardsToProcess.length === 0) {
    console.log("✅ All cards are already generated! Exiting.");
    return;
  }
  const ai = new GoogleGenAI({ apiKey: API_KEY });

  for (let i = 0; i < cardsToProcess.length; i++) {
    await generateArtForCard(ai, cardsToProcess[i]);
    // Safety sleep
    await new Promise(r => setTimeout(r, 1000));
  }
}

main();