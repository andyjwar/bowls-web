const FORM_PROMPT = `You are reading an Ipswich & District Federation Bowls League paper results form (often handwritten).

Extract everything you can read and return ONLY valid JSON (no markdown) with this shape:
{
  "rawText": "full transcription of visible printed and handwritten text",
  "homeClub": "home team/club name or null",
  "awayClub": "visitors/away team name or null",
  "division": "division letter or number or null",
  "matchDate": "YYYY-MM-DD or null",
  "homePoints": number or null,
  "awayPoints": number or null,
  "homeShots": number or null,
  "awayShots": number or null,
  "homePlayers": ["name", "..."],
  "awayPlayers": ["name", "..."],
  "confidence": "high" | "medium" | "low"
}

Use null when a field is unreadable. For player names, include all names listed in the HOME TEAM and AWAY TEAM columns.`

export async function extractWithVision(buffer, mimetype) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null

  const model = process.env.OPENAI_VISION_MODEL?.trim() || 'gpt-4o-mini'
  const base64 = buffer.toString('base64')
  const mediaType = mimetype?.startsWith('image/') ? mimetype : 'image/jpeg'

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: FORM_PROMPT },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mediaType};base64,${base64}`,
                detail: 'high',
              },
            },
          ],
        },
      ],
      max_tokens: 2500,
    }),
  })

  if (!response.ok) {
    const err = await response.text().catch(() => '')
    throw new Error(`Vision OCR failed (${response.status}): ${err.slice(0, 200)}`)
  }

  const payload = await response.json()
  const content = payload.choices?.[0]?.message?.content
  if (!content) return null

  const parsed = JSON.parse(content)
  return {
    rawText: String(parsed.rawText ?? '').trim(),
    structured: parsed,
    method: 'vision',
    ocrMeta: { confidence: parsed.confidence ?? 'medium', variant: 'vision' },
    warning: null,
  }
}

export function structuredToSamfordHints(structured) {
  if (!structured) return null
  return {
    home: structured.homeClub ?? null,
    away: structured.awayClub ?? null,
    divisionId: structured.division
      ? String(structured.division).toLowerCase()
      : null,
    matchDate: structured.matchDate ?? null,
    homePoints: structured.homePoints ?? null,
    awayPoints: structured.awayPoints ?? null,
    homeShots: structured.homeShots ?? null,
    awayShots: structured.awayShots ?? null,
    players: {
      home: structured.homePlayers ?? [],
      away: structured.awayPlayers ?? [],
    },
    visionConfidence: structured.confidence ?? null,
  }
}
