// api/notion-pull.js
// Vercel serverless function — live Notion pull for QM RP Dashboard
// Queries QM Right Pricing DB (a64a0fd0...) connected to Joanie AI Ops Monitor

const NOTION_API = 'https://api.notion.com/v1';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const token  = process.env.NOTION_TOKEN;
  const dbId   = process.env.NOTION_DB_ID || 'a64a0fd07f5b4aa18b12639b8bf7a87d';
  const season = req.query.season || 'SEP';

  if (!token) {
    return res.status(500).json({ ok: false, error: 'NOTION_TOKEN not set in Vercel environment variables.' });
  }

  try {
    // Query the DB with optional season filter
    const body = {
      page_size: 100,
      filter: {
        property: 'Season',
        select: { equals: season }
      }
    };

    const r = await fetch(`${NOTION_API}/databases/${dbId}/query`, {
      method:  'POST',
      headers: {
        'Authorization':  `Bearer ${token}`,
        'Notion-Version': '2022-06-28',
        'Content-Type':   'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!r.ok) {
      const err = await r.text();
      return res.status(500).json({ ok: false, error: `Notion API error ${r.status}: ${err}` });
    }

    const data = await r.json();

    // Map Notion properties to the shape the dashboard expects
    const publishers = data.results
      .filter(p => !p.archived && !p.in_trash)
      .map(page => {
        const P = page.properties;
        const str  = k => P[k]?.rich_text?.[0]?.plain_text  ?? P[k]?.title?.[0]?.plain_text  ?? null;
        const sel  = k => P[k]?.select?.name  ?? null;
        const num  = k => P[k]?.number        ?? null;
        const msel = k => P[k]?.multi_select?.map(o => o.name).join(', ') || null;

        return {
          name:         str('Publisher')            || sel('Publisher'),
          season:       sel('Season'),
          mpqsGrade:    sel('MPQS Score'),
          gpth:         num('GP/TH'),
          ltv:          num('Adjusted LTV'),
          actualCpa:    num('Actual CPA'),
          targetCpa:    num('Target CPA'),
          baseBid:      num('Suggested Bid'),
          bidFloor:     num('Bid Floor'),
          eff:          num('Effectuation %'),
          rde:          num('RDE %'),
          age75:        num('Demo Age Over 75 %'),
          sc60:         num('SC % 60+'),
          cr:           num('Conversion Rate %'),
          subIds:       (msel('Sub IDs') || str('Sub IDs') || '').split(',').map(s => s.trim()).filter(Boolean),
          rpAction:     sel('RP Action'),
          actionBand:   sel('Action Band'),
          status:       sel('Status'),
          cpaDelta:     num('CPA Delta'),
          notes:        str('Partner Notes'),
        };
      })
      .filter(p => p.name); // drop blank rows

    return res.status(200).json({
      ok:        true,
      season,
      pulledAt:  new Date().toISOString(),
      count:     publishers.length,
      publishers,
    });

  } catch (err) {
    console.error('notion-pull error:', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
