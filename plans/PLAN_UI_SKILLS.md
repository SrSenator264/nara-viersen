# PLAN: UI skills for Flamo pages (2026-10-27)

Status: **parked** — revisit when reviewing the website. Remind Omar of this plan then.

## Decision
1. **Install `mobile-native` first** (emilkowalski/skills, skills/mobile-native/SKILL.md).
   - Fixes touch problems on phone/tablet pages: sticky hover, tap flash, 100vh bug, input zoom, tap lag, pull-to-refresh, notch/safe area, theme-color.
   - Light, one file, does not change the Kasse look.
   - Relevant pages: Kasse, kitchen, drivers, Live Orders.
2. **Add `frontend-design`** (anthropics/skills, skills/frontend-design/SKILL.md) when starting the public Flamo website / brand work.
   - Not needed for Kasse/kitchen pages.
3. **Skip `ui-ux-pro-max`** (nextlevelbuilder/ui-ux-pro-max-skill) for now.
   - Very large (192 rules, Python + CLI), token-heavy; says "no emojis as icons", which conflicts with the cards/emojis style.

## Not reviewed (GitHub blocked automated reading)
- anthropics/skills (tree)
- ibelick/ui-skills
- emilkowalski/skills (tree, other skills in it)
- vercel-labs/agent-skills

## When revisiting
- Model: Sonnet.
- Install = copy the skill folder into the repo's `.claude/skills/`, commit, push to main.
- After install, test on the real phone (not browser emulation).
