# no-fomo — Market Research Summary

Date: 6 October 2026

## 1. Main conclusions

- There is a value proposition, but **not** in "organize my saved reels". That space is crowded and cheap.
- The money is with people who **earn from content**.
- no-fomo now analyzes **any Instagram account**, not only saved posts. This moves it into the **creator research** category, where people pay.
- Best first buyer: **business owners and solo experts who make their own reels**.
- People pay for a **result**, not for analysis: "a ready content plan for my business every week, based on what works in my niche."
- We sell **software** (subscription), not a service. The first 10–20 customers can be served partly by hand to learn what they need.
- A few thousand dollars per month is realistic. The main limit is **reaching people**, not building features.

## 2. Product (current state)

- Syncs saved Instagram posts into a local app (grid, filters, video player, batch cleanup).
- Per-post AI report from video frames and audio, exported as Markdown.
- Search any account and analyze its posts.
- Real example: transcribed 100 reels of a marketing expert and generated 100 content ideas for own business.
- Core is open source. Plan: paid, proprietary version on top.
- Mission: fight FOMO — let AI watch and extract knowledge instead of scrolling.

## 3. Competitive landscape

| Group | Examples | Price | Gap vs no-fomo |
|---|---|---|---|
| Saved-post organizers | Dewey, Ordo, Reel Mind, ReelRecall, Quiki, Miora, Vestron | Free – ~$19/mo | Search and summary only; weak reports; many need manual sharing |
| Learning / knowledge bases | Recall, Readwise | ~$10–13/mo | Built for YouTube and articles, not Instagram |
| "AI watches for you" digests | BibiGPT, Summate, TubeOnAI, Hey Isabella | Low | Generic summaries |
| Creator research tools | Sandcastles, Format Finder, Creator Decoder, VideoToTextAI, GetTranscribe, Reelyze, TokScript | Free – $97/mo | Focus on virality, hooks and scores for creators |

Key facts:
- AI search over saved reels already exists (Reel Mind, Quiki with MCP).
- Consumer tools are cheap ($3–13/mo). Creator tools charge 4–10x more (Sandcastles ~$39/mo, Format Finder ~$97/mo).
- "AI watches content for you" is a real and growing trend.
- For a business owner, the real alternatives are **ChatGPT** (free) or **hiring a social media manager** ($300–1000/mo), not the tools above.

## 4. Positioning

**Draft line:** "Learn from any expert on Instagram. Turn their reels into knowledge or a content plan for your business."

**Sales line for business owners:** "A social media manager's weekly plan for $49."

Differentiators:
- **Proof by numbers:** show which reels did far better than the account's usual views, and why. Without this we are just another idea generator (ChatGPT gives ideas for free).
- **Business context:** user describes the business once; all reports and ideas adapt to it.
- **Depth across a whole account:** what the expert teaches, repeated frameworks, what to reuse — not only hooks and scores.
- **One engine, two outputs:** learn (knowledge) or make (ideas, scripts). Keeps the anti-FOMO mission.
- **Rich reports** from frames and audio.
- **Batch cleanup** of saves, synced to Instagram.
- **Non-English content** (for example, Russian) — first niche.

## 5. Who will pay (ranked)

1. Small business owners and solo experts (coaches, consultants, local services) who make their own content.
2. Social media managers and small agencies.
3. Full-time creators (already served by Sandcastles and similar).
4. Learners (anti-FOMO use; pay little, high churn).

Best place to find them: people who **already pay** for reels courses and social media coaching.

## 6. Final product (paid version)

A hosted web app: **an AI content strategist for experts and small businesses.**

Must have (what people pay for):
1. **Hosted, no setup.** Sign up, describe the business once, add 5–10 top accounts in the niche and the user's own account. No local app, no API keys.
2. **Analysis based on numbers.** Which reels did far better than the account's usual views, and the patterns behind them.
3. **Ready-to-film scripts.** Hook, structure and call to action, adapted to the user's business and language. Not only ideas.
4. **New plan every week** from the followed accounts, delivered in the app, by email or Telegram. This is the reason to keep paying.
5. **On demand:** deep analysis of any expert's account — "learn from them" or "make content like this."

Free (brings people in, does not make them pay):
- Open-source local app: saved posts, organizing, batch cleanup.

Later: TikTok and YouTube; analysis of the user's own account ("what works for me").

Pricing:

| Plan | Price | For |
|---|---|---|
| Free | $0 | Open-source local app |
| Pro | $49/mo | One business |
| Agency | $149/mo | Several businesses |

- $20–40 is too low for a business result. Start at $49 and raise it if nobody pushes back.
- Test a "we make your monthly plan" option at $150–300 with the first customers to see if they want done-for-you.
- Use credits or limits for heavy users.

Open source role: brings developers and trust, not buyers.

## 7. Economics

Cost per Pro user ($49/mo):
- AI: small OpenAI models, about $0.01–0.03 per reel. Heavy user (300 reels/mo) ≈ $3–9.
- Instagram data, hosting, payment fees ≈ $3–6.
- Margin ≈ 75–85%.

Simple rule: **maximum paying users = new payers per month ÷ monthly churn.**
- Example: 30 new payers/mo with 8% churn → ~375 users → ~$18k/mo ceiling.
- To grow: win more buyers each month or keep them longer (weekly plan).

Getting buyers:
- Selling by hand: about 1 sale per 10–20 real conversations.
- Partners (social media coaches): pay 20–30% of what their students pay. Best way to scale.
- Count conversations, not trial users. Self-serve free-to-paid math (2–5%) applies only later.

Revenue estimate (selling every week):

| Time | Monthly revenue |
|---|---|
| After 12 months | $1k–4k |
| After 24 months | $7k–15k |
| Strong goal (2–3 years) | $10k–30k |
| Best case solo | ~$1M/year — possible, rare |

Effect of AI as a solo founder:
- Raises how much one person can run (hire point moves to ~$30k–50k/month).
- Does not solve attention, trust, competition (they use AI too) or Instagram risk.
- The limit is how many of the right people you reach.

## 8. Risks

- **Instagram data in the hosted version — biggest risk.** Analyzing other people's accounts at scale from our servers is where Instagram is most likely to block us. Decide how to get the data before building.
- **Instagram dependency:** private API; Meta can block access and revenue drops to zero. Add TikTok/YouTube in year 1.
- **Account risk:** bulk analysis of public accounts through the user's session is more aggressive than syncing saves. Keep throttling and warnings.
- **Hosted version:** adds account and Meta ToS risk; local-first protected against this.
- **AI cost:** heavy users (hundreds of reels) must still leave margin. Use limits or credits.
- **Copying concerns:** position as inspiration and learning, not rewriting other people's content.
- **Payments:** card payments (Stripe, Paddle) mostly do not work for users inside Russia. Russian speakers abroad are easier.

## 9. How to reach buyers

1. **Partners:** marketing coaches and SMM teachers who can bring their students. Best channel to scale.
2. **Product as outreach:** analyze a business owner's account (or an expert in their field) and send a free short report with 10 ideas.
3. **Sell by hand first:** 10–20 business owners, charge from day one, learn what the paid version needs.
4. **Own case as content:** "100 reels → 100 ideas for my business", with real output. Post on Instagram, LinkedIn, Threads, Telegram.
5. **Communities:** small-business and expert groups on Facebook and Telegram; r/smallbusiness, r/socialmedia. Help, do not spam.

## 10. Leads

Target (confirmed): **Russian-speaking business owners and experts in Israel who make their own reels.**

First list: 95 leads with Instagram from SarafanPRO, saved locally in `leads/israel-ru-sarafanpro.csv` (git-ignored, personal data).
- 51 experts (coaches, psychologists, beauty, real estate, teachers) — best fit.
- 20 services, 15 trades — weaker fit.
- 9 SMM / marketing — possible partners.

Sources checked:
- SarafanPRO — profiles show Instagram, Telegram, Facebook. Used.
- Orbita Profi — ~10,000 profiles, but no Instagram shown and mostly trades. Skipped.
- RUPROFI — very few Israel profiles.
- Next source for more leads: Russian-speaking business groups on Telegram and Facebook.

## 11. Next steps

- Check which leads actually post reels (use no-fomo on their accounts).
- Talk to 10–20 of them; serve the first ones partly by hand.
- Find 2–3 SMM coaches as partners.
- Decide how the hosted version gets Instagram data.
- Build the hosted paid version.
- Publish the "100 reels → 100 ideas" case.
