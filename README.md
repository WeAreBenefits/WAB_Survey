# WAB Fit Survey — setup guide for Ted

A private, one-time survey for business owners and referral partners.
WAB sends each person their own link. Answers lock as they go, there is no going back,
and the link closes for good once they see their results.

Built and tested on Oct 2, 2026 against a real Postgres database (the same engine Supabase uses).
36 automated browser checks passed on phone and desktop sizes.

---

## What was added (nothing existing was changed)

| File | What it is |
|---|---|
| `fit-survey.html` | The survey page. **Not linked from the site menu** and marked "noindex" so Google won't list it. |
| `fit-survey/fit-survey.js` | Draws the screens. |
| `fit-survey/fit-survey.css` | Styling, using the site's own navy/gold colors from `styles.css`. |
| `fit-survey/config.js` | The 3 settings you fill in (below). |
| `fit-survey/supabase/fit_survey.sql` | The database: tables, locking rules, results logic, link maker. |
| `fit-survey/README.md` | This guide. |

The site is still plain HTML/CSS/JS, so it keeps working on GitHub Pages (or any static host).

---

## Setup (about 15 minutes, one time)

1. **Create a free Supabase project** at supabase.com, signed up with a WAB email so the company owns the data.
2. **Load the database:** Supabase → *SQL Editor* → *New query* → paste all of `fit-survey/supabase/fit_survey.sql` → **Run**.
3. **Copy two values:** Supabase → *Project Settings* → *API*:
   - Project URL → `supabaseUrl` in `fit-survey/config.js`
   - `anon` `public` key → `supabaseAnonKey` in `fit-survey/config.js`
   - ⚠️ **Never** paste the `service_role` key anywhere in the site.
4. **Commit and push** to GitHub as usual.

The `anon` key is safe to be public: the database only lets it call the three survey functions.
It cannot read anyone's answers, see other links, or make links.

---

## Sending a survey (Shmuel or Ted)

In Supabase → *SQL Editor*, run one line:

```sql
-- Business owner survey:
select public.survey_create_link('owner', 'Ada''s uncle - 200 employees', 'Shmuel');

-- Referral partner survey:
select public.survey_create_link('partner', 'Ada', 'Ted');
```

It returns a code like `3f9c2a…`. The link to send is:

```
https://YOUR-SITE-ADDRESS/fit-survey.html?t=3f9c2a…
```

The label (second item) is only for you: it's how you'll recognize who answered.

## Seeing answers

```sql
select * from public.survey_responses;
```

Shows every link: their name, email, phone, whether they said OK to calls/texts, who it was for, when it was opened and finished, every answer, and the result they saw.
(Supabase's *Table Editor* also works.)

---

## Rules the database enforces (not just the page)

- Only links WAB created work. Anything else shows "This link isn't valid."
- Questions must be answered **in order, once**. A locked answer can never be changed, even by someone tech-savvy.
- The browser Back button does nothing except show "Answers are locked."
- Refreshing or reopening mid-way picks up at the next unanswered question.
- Results are calculated on the server and shown **once**. After that, the link (on any device) says "Thanks, you've already completed this survey."
- The plan question has only two answers, so results always recommend **Plan A or Plan B, never both**.
- Question 1 is their name (required). Question 2 is how to reach them: email (required, checked for a real format), phone (optional), and an unchecked-by-default box giving permission to call or text. Only call or text people who checked that box.
- No dollar amounts and no income claims anywhere. The estimate is a headcount: "About 85 of your employees may be able to take part."

## Settings you can change later (no code)

| Setting | Now | Why it's a placeholder |
|---|---|---|
| `owner_min_fulltime` | 10 | **Unknown.** Replace with PTA's and Ignite's real minimums. |
| `include_part_time` | false | **Unknown.** Turn on if providers count part-time staff. |

```sql
update public.survey_settings set value = '25' where key = 'owner_min_fulltime';
update public.survey_settings set value = 'true' where key = 'include_part_time';
```

## Before sending to real people

- [ ] WAB's CA entity license and E&O are in place.
- [ ] Put the CA license number in `config.js` → `licenseNumber` (it then shows in the footer automatically).
- [ ] Lawyer reviews the questions, results wording, the privacy promises on the first screen, and the call/text consent wording.
- [ ] Add a Privacy Policy page to the site (the survey now collects email and phone).
- [ ] Confirm the minimum headcount with PTA and Ignite (setting above).
- [ ] Send one test link to yourself on your phone: answer, try Back, close and reopen, finish, reopen again.

---

## ⚠️ Separate issue spotted on the current site (not changed)

`index.html` shows a savings calculator ("up to **$50 per participating employee per month**", "**$30,000** annual potential")
and a hero button "See If Your Business Qualifies". WAB's own deck rules say no savings numbers or worked dollar examples,
and the site shouldn't pitch savings before the entity license and E&O are in place. Worth reviewing with Shmuel and the lawyer before launch.

© 2026 We Are Benefits, LLC. All rights reserved. Proprietary and confidential. Do not copy or share without written permission.
