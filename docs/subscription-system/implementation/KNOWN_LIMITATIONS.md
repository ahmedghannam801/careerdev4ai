# CareerDev4AI — Subscription & Payment System Known Limitations

> **Document Version:** 1.0.0  
> **Date:** 2026-11-06  
> **Audience:** Engineering Team, Product Operations, Customer Support  

---

## 1. Operational & Financial Integration Realities

### 1.1 Vodafone Cash & InstaPay Manual Verification
- **Current Limitation:** Egyptian mobile money wallets (Vodafone Cash, Orange Money, Etisalat Cash, WE Pay) and Central Bank of Egypt's Instant Payment Network (InstaPay) do not provide public webhook/REST APIs for peer-to-peer or small business accounts.
- **Architectural Handling:**
  - Automated pre-checks (duplicate reference matching, binary image hash, OCR heuristic extraction) gate entry into a 24-hour temporary access window.
  - Final subscription confirmation strictly requires an authorized platform administrator (`payments.confirm` permission) to verify actual credit arrival on the destination corporate wallet or bank account.
- **Mitigation:** The system is built with modular provider interfaces (`server/payments/`), so when official aggregator APIs (e.g., Paymob, Fawry, Kashier) are onboarded, automated webhooks can transition payment requests to `paid` using the same atomic state transition functions without redesigning the subscription engine.

### 1.2 Google Gemini Free-Tier Daily Quotas
- **Current Limitation:** The default Google Gemini API Free-Tier imposes a ceiling of 20 requests per day per project.
- **Impact on Paid Subscribers:** Paying commercial users (with 25, 60, or 120 monthly credits) cannot be reliably served if the platform operates on the free-tier Gemini API key.
- **Operational Requirement:** The platform owner must configure a paid Google Gemini API key (Pay-As-You-Go) in production secrets (`GEMINI_API_KEY`) prior to marketing paid subscription tiers.
- **Fallback Behavior:** If Gemini quotas are exhausted, the server-side unified provider (`server/ai/provider.ts`) falls back to OpenRouter (`openrouter/free`), maintaining service availability.

### 1.3 Temporary Access 24-Hour Scope Limits
- **Intentional Limitation:** Users granted provisional 24-hour access while payment is pending manual verification are restricted to operations costing $\le 2$ credits (e.g., JD analysis, ATS match score, single cover letter).
- **Security Rationale:** High-cost token operations (deep CV rewrites, career roadmap creation, multi-turn mock interviews) are held until human verification to prevent receipt fraud and resource exhaustion.

### 1.4 Egyptian Personal Data Protection (Law 151 of 2020)
- **Birth Date Collection:** The system strictly collects only `birth_month` (1-12) and `birth_day` (1-31). The birth year is **never collected, requested, or stored**, minimizing PII liability while enabling annual 30% birthday discount coupons.

