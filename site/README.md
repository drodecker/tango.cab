# Tango Cab (`tango.cab`)

Autonomous Fleet Operations, Wireless Inductive Depots & Transportation-As-A-Service (TaaS) in Orange County, CA.

Built by **ClawdyDa Aye Eye Consulting** ([clawdy.rodecker.com](https://clawdy.rodecker.com)) for **Tango Cab**.

---

## 🚀 Overview

Tango Cab establishes dedicated Cybercab fleets and partners with the autonomous Robotaxi network to empower transportation-as-a-service. We provide the full operating layer:
- **Fleet Asset & Telematics Management** (100% equity-acquired, zero vehicle debt)
- **Wireless Inductive Charging Depots** (flush ground charging pads on owned/partner properties)
- **Robotic Cleaning & Detailing** (standardized 5-star passenger cabin quality)
- **CPUC & Commercial Insurance Permitting** (Level 4 commercial underwriting)
- **Property Partner Monetization** (turning dormant parking spaces into high-yield charging infrastructure)

---

## 📁 Repository Structure

```
├── index.html                   # Flagship interactive landing page (Hero, Business Layer, Map, ROI Calc, Leads)
├── investors.html               # Dedicated Investor Prospectus & Deep Pro-Forma (CAPEX, OPEX, Scenarios)
├── config.js                    # Site configuration (Mapbox public keys, Worker URL, Table IDs, Model)
├── tesla_areas.geojson          # GeoJSON coverage polygons for Austin and Orange County
├── images/                      # High-resolution photorealistic generated imagery
│   ├── cybercab_charging_pad.jpg    # Cybercab on wireless inductive charging pad
│   ├── cybercab_carwash_cleaning.jpg# Cybercab passing through robotic wash bay
│   └── cybercab_fleet_hero.jpg      # Cybercab fleet staged at Orange County pavilion
├── functions/
│   └── submit.js                # Cloudflare Pages serverless submission proxy
└── worker/
    ├── worker.js                # Cloudflare Worker form proxy to NocoDB
    └── wrangler.toml            # Worker deployment settings
```

---

## 📊 Live Base & Table Schemas (NocoDB Base: "OC.CAB Leads")

### 1. `investors` (`mqi90dk7p4nlpf0`)
- `type`: SingleSelect (`Individual`, `Corporate / Fund`)
- `name`: SingleLineText
- `email`: Email
- `phone`: PhoneNumber
- `entity`: SingleLineText
- `social`: SingleLineText (LinkedIn / X)
- `interest_range`: SingleSelect (`$100k–$250k`, `$250k–$1.5MM`, `$1.5MM+`)
- `source`: SingleLineText
- `notes`: LongText
- `accredited`: SingleLineText (`on`)
- `status`: SingleSelect (`New`, `Contacted`, `Pitched`, `Soft-commit`, `Committed`, `Passed`)  -  default: `New`
- `submitted_at`: DateTime
- `ip`: SingleLineText
- `user_agent`: SingleLineText

### 2. `property_partners` (`m2fsritrqpepcc2`)
- `name`, `email`, `phone`, `markets`, `capacity`, `existing_charging`, `notes`, `status`, `submitted_at`, `ip`, `user_agent`

### 3. `careers` (`mewoa8u9qvjlsvb`)
- `role` (SingleSelect: `CEO`, `CFO`, `CTO`, `COO`, `CMO`, `Other`), `name`, `email`, `phone`, `linkedin`, `other_profile`, `resume_url`, `notes`, `status`, `submitted_at`, `ip`, `user_agent`

---

## 🌐 Deployment Instructions

### Cloudflare Pages (Static Site)
1. Link repository to Cloudflare Pages.
2. Build command: None (pure modern static HTML/CSS/JS).
3. Output directory: `/` (root).
4. Custom Domain: `tango.cab`.

### Cloudflare Worker (Form Proxy)
```bash
cd worker
wrangler secret put NOCODB_URL     # e.g. https://nocodb.yourdomain.com
wrangler secret put NOCODB_TOKEN   # xc-token / API key
wrangler secret put TURNSTILE_SECRET # (optional) Turnstile secret key
wrangler deploy
```

---

## ⚖️ Legal Disclaimers
Tesla, Cybercab, and Robotaxi are registered trademarks of Tesla, Inc. Their mention is nominative and descriptive. Tango Cab maintains no formal agency or allocation agreement with Tesla, Inc. All vehicle availability dates and network terms are manufacturer targets. Pro-forma financial models are illustrative scenarios.
