const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Photos come in as base64 — allow a generous body size.
app.use(express.json({ limit: "12mb" }));

// The native app calls this server from its own origin (capacitor://localhost
// or similar), not a browser page served by this server, so CORS must be open
// for the /api routes. Tighten `origin` to your app's real origin if you want
// to lock this down later.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static(path.join(__dirname, "public")));

const KNOWN_INGREDIENTS = [
  "onion","garlic","tomato","bell pepper","spinach","carrot","potato","lemon",
  "broccoli","mushroom","zucchini","cilantro","ginger","avocado",
  "eggs","chicken breast","ground beef","tofu","canned beans","bacon","shrimp","canned tuna",
  "butter","milk","cheddar cheese","parmesan","yogurt","cream",
  "rice","pasta","flour","olive oil","soy sauce","canned tomatoes","stock","bread","tortillas"
];

app.post("/api/recognize", async (req, res) => {
  try {
    const { image, mediaType } = req.body;
    if (!image) {
      return res.status(400).json({ error: "No image provided." });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({
        error: "Server is missing ANTHROPIC_API_KEY. Add it in Replit's Secrets tab."
      });
    }

    const prompt = `You are looking at a photo of a fridge, pantry, or countertop.
List every food ingredient you can actually see, in lowercase, singular where natural (e.g. "tomato" not "tomatoes").
Prefer matching to this known list where an item clearly fits: ${KNOWN_INGREDIENTS.join(", ")}.
If you see something real but not on that list, include it anyway using a short plain name.
Respond ONLY with a JSON array of strings, nothing else. No markdown, no explanation. Example: ["onion","eggs","spinach"]`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image
                }
              },
              { type: "text", text: prompt }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", errText);
      return res.status(502).json({ error: "The vision API request failed." });
    }

    const data = await response.json();
    const textBlock = (data.content || []).find(b => b.type === "text");
    const raw = textBlock ? textBlock.text.trim() : "[]";
    const cleaned = raw.replace(/```json|```/g, "").trim();

    let ingredients = [];
    try {
      ingredients = JSON.parse(cleaned);
      if (!Array.isArray(ingredients)) ingredients = [];
    } catch (e) {
      console.error("Could not parse model response as JSON:", raw);
      ingredients = [];
    }

    ingredients = ingredients
      .filter(i => typeof i === "string")
      .map(i => i.toLowerCase().trim())
      .filter(Boolean);

    res.json({ ingredients });
  } catch (err) {
    console.error("Recognize error:", err);
    res.status(500).json({ error: "Something went wrong reading that photo." });
  }
});

app.listen(PORT, () => {
  console.log(`What's In There running on port ${PORT}`);
});
