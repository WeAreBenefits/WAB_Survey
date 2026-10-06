/* WAB Fit Survey — one-time, locked-answer survey.
   The server (Supabase functions in supabase/fit_survey.sql) enforces every rule:
   valid link, one answer per question, in order, no changes, results once.
   This file only draws the screens.
   © 2026 We Are Benefits, LLC. All rights reserved. Proprietary and confidential. */
(function () {
  "use strict";

  var CFG = window.WAB_SURVEY_CONFIG || {};
  var app = document.getElementById("app");
  var toast = document.getElementById("toast");
  var token = new URLSearchParams(location.search).get("t") || "";
  var CONTACT = CFG.contactName || "Shmuel";

  if (CFG.licenseNumber) {
    document.getElementById("license").textContent = " CA License # " + CFG.licenseNumber + ".";
  }

  var STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","DC","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];
  var STATE_NAMES = {AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",DC:"District of Columbia",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming"};

  // Question order MUST match public.survey_questions() in fit_survey.sql.
  var SURVEYS = {
    owner: {
      title: "Is this a fit for your business?",
      intro: "11 quick questions about you and your team. About 2 minutes.",
      questions: [
        { id: "name", kind: "text", q: "First, what's your name?", why: "So we know who we're talking to." },
        { id: "contact", kind: "contact", q: "How can we reach you?", why: "So we can follow up on your results. We never sell your information." },
        { id: "state", kind: "state", q: "What state is your business in?", why: "We're starting in California, with more states coming." },
        { id: "industry", kind: "choice", q: "What industry are you in?", why: "Helps us understand your team.",
          options: [["restaurants","Restaurants & food"],["construction","Construction & trades"],["healthcare","Healthcare"],["retail","Retail"],["professional","Professional services"],["manufacturing","Manufacturing"],["transportation","Transportation & logistics"],["other","Other"]] },
        { id: "ft_w2", kind: "number", q: "How many full-time W-2 employees do you have?", why: "Most programs are built around full-time staff." },
        { id: "pt_w2", kind: "number", q: "How many part-time W-2 employees?", why: "Some programs include part-time staff, some don't." },
        { id: "contractors", kind: "choice", q: "Do you also use 1099 contractors?", why: "Contractors usually aren't part of payroll programs.",
          options: [["yes","Yes"],["no","No"],["not_sure","Not sure"]] },
        { id: "over_50k", kind: "number", q: "About how many employees earn over $50,000 a year?", why: "Pay levels affect how programs fit your team." },
        { id: "payroll_freq", kind: "choice", q: "How often do you run payroll?", why: "Programs work through your payroll schedule.",
          options: [["weekly","Weekly"],["biweekly","Every 2 weeks"],["semimonthly","Twice a month"],["monthly","Monthly"],["not_sure","Not sure"]] },
        { id: "benefits", kind: "multi", q: "What benefits do you offer today?", why: "Our programs sit alongside what you have. Pick all that apply.",
          options: [["medical","Medical"],["dental_vision","Dental or vision"],["retirement","Retirement"],["none","None yet"],["not_sure","Not sure"]], exclusive: ["none","not_sure"] },
        { id: "priority", kind: "choice", q: "What matters most to you right now?", why: "Points you to the right plan. Pick one.", noUnsure: true,
          options: [["costs","Lowering payroll costs"],["benefits","Better benefits for my team"]] }
      ]
    },
    partner: {
      title: "Is our referral program a fit for you?",
      intro: "7 quick questions about you and your network. About 2 minutes.",
      questions: [
        { id: "name", kind: "text", q: "First, what's your name?", why: "So we know who we're talking to." },
        { id: "contact", kind: "contact", q: "How can we reach you?", why: "So we can follow up on your results. We never sell your information." },
        { id: "role", kind: "choice", q: "What best describes you?", why: "So we can show you the right program.",
          options: [["cpa","CPA or bookkeeper"],["payroll_hr","Payroll or HR pro"],["agent","Insurance agent"],["owner","Business owner"],["other","Other"]] },
        { id: "licensed", kind: "choice", q: "Are you a licensed insurance producer?", why: "Licensed and non-licensed partners work a little differently.", noUnsure: true,
          options: [["yes","Yes"],["no","No"]] },
        { id: "owners_per_month", kind: "choice", q: "About how many business owners do you talk to in a month?", why: "Helps us understand your network.",
          options: [["0_5","0–5"],["6_20","6–20"],["21_50","21–50"],["50_plus","50+"]] },
        { id: "business_size", kind: "choice", q: "How big are most of those businesses?", why: "Our programs fit some sizes best.",
          options: [["under_10","Under 10 employees"],["10_49","10–49"],["50_199","50–199"],["200_plus","200+"],["not_sure","Not sure"]] },
        { id: "states", kind: "states", q: "Which states are they in?", why: "We're starting in California. Pick all that apply." }
      ]
    }
  };

  var PROMISES = [
    ["Only what we need.", "Your name, email and (if you want) phone, so we can follow up."],
    ["We never sell your information.", "We use it only to follow up on this survey."],
    ["We ask before sharing.", "If a partner program looks like a fit, we'll ask you before we pass your company's details along."],
    ["No obligation.", "Taking this survey doesn't commit you to anything."],
    ["Delete anytime.", "Email admin@wearebenefits.com and we'll remove your answers."]
  ];

  // ---------------- server calls ----------------
  function rpc(fn, args) {
    if (!CFG.supabaseUrl || !CFG.supabaseAnonKey) {
      return Promise.reject(new Error("not_configured"));
    }
    return fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers: {
        "apikey": CFG.supabaseAnonKey,
        "Authorization": "Bearer " + CFG.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(args)
    }).then(function (r) {
      if (!r.ok) throw new Error("http_" + r.status);
      return r.json();
    });
  }

  // ---------------- state ----------------
  var survey = null;     // SURVEYS[type]
  var index = 0;         // current question index
  var pick = null;       // current (unlocked) selection
  var busy = false;

  // ---------------- helpers ----------------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  function render(nodes) {
    app.innerHTML = "";
    nodes.forEach(function (n) { if (n) app.appendChild(n); });
    var h = app.querySelector("h1, h2");
    if (h) { h.setAttribute("tabindex", "-1"); h.focus({ preventScroll: true }); }
    window.scrollTo(0, 0);
  }
  function showToast(msg) {
    toast.textContent = msg;
    toast.hidden = false;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(function () { toast.hidden = true; }, 2600);
  }
  function promisesBlock() {
    return el("ul", { class: "fs-promises" }, PROMISES.map(function (p) {
      return el("li", null, [el("b", { text: p[0] }), " " + p[1]]);
    }));
  }

  // Block the browser Back button from undoing anything.
  history.pushState({ fs: 1 }, "");
  window.addEventListener("popstate", function () {
    history.pushState({ fs: 1 }, "");
    showToast("Answers are locked once you press Next, so there's no going back.");
  });

  // ---------------- screens ----------------
  function screenMessage(title, body) {
    render([el("h1", { class: "fs-title", text: title }), el("p", { class: "fs-lead", text: body })]);
  }

  function screenError(err) {
    if (err && err.message === "not_configured") {
      screenMessage("Survey not set up yet", "This survey isn't connected to its database yet. If you're from WAB, fill in fit-survey/config.js.");
    } else {
      screenMessage("Something went wrong", "We couldn't reach the survey. Check your connection and refresh the page. Your locked answers are saved.");
    }
  }

  function screenIntro() {
    render([
      el("div", { class: "fs-eyebrow", text: "WE ARE BENEFITS" }),
      el("h1", { class: "fs-title", text: survey.title }),
      el("p", { class: "fs-lead", text: survey.intro }),
      el("div", { class: "fs-lock-note" }, [
        el("b", { text: "Heads up: answers lock." }),
        " Once you press Next, that answer is saved and can't be changed, and this link works one time only. Take your time."
      ]),
      promisesBlock(),
      el("button", { class: "btn fs-next", type: "button", onclick: function () { screenQuestion(); } }, ["Start"])
    ]);
  }

  function optionButton(value, label, selected, onPick, multi) {
    return el("button", {
      type: "button",
      class: "fs-opt" + (selected ? " is-on" : ""),
      role: multi ? "checkbox" : "radio",
      "aria-checked": selected ? "true" : "false",
      onclick: function () { onPick(value); }
    }, [el("span", { class: "fs-dot", "aria-hidden": "true" }), label]);
  }

  function screenQuestion() {
    var q = survey.questions[index];
    var total = survey.questions.length;
    var body = el("div", { class: "fs-input" });
    var next = el("button", { class: "btn fs-next", type: "button", disabled: "disabled" }, [index === total - 1 ? "Lock in & see my results" : "Lock in & next"]);

    function setPick(v) {
      pick = v;
      if (v === null || (Array.isArray(v) && !v.length)) next.setAttribute("disabled", "disabled");
      else next.removeAttribute("disabled");
    }

    if (q.kind === "choice") {
      var opts = q.options.slice();
      var draw = function () {
        body.innerHTML = "";
        var grid = el("div", { class: "fs-opts", role: "radiogroup", "aria-label": q.q });
        opts.forEach(function (o) {
          grid.appendChild(optionButton(o[0], o[1], pick === o[0], function (v) { setPick(v); draw(); }, false));
        });
        body.appendChild(grid);
      };
      draw();
    }

    if (q.kind === "multi") {
      var drawM = function () {
        body.innerHTML = "";
        var cur = Array.isArray(pick) ? pick : [];
        var grid = el("div", { class: "fs-opts", role: "group", "aria-label": q.q });
        q.options.forEach(function (o) {
          grid.appendChild(optionButton(o[0], o[1], cur.indexOf(o[0]) > -1, function (v) {
            var s = cur.slice();
            if (s.indexOf(v) > -1) s = s.filter(function (x) { return x !== v; });
            else if (q.exclusive.indexOf(v) > -1) s = [v];
            else s = s.filter(function (x) { return q.exclusive.indexOf(x) < 0; }).concat(v);
            setPick(s); drawM();
          }, true));
        });
        body.appendChild(grid);
      };
      drawM();
    }

    if (q.kind === "number") {
      var num = el("input", { type: "number", inputmode: "numeric", min: "0", max: "100000", step: "1", class: "fs-num", placeholder: "0", "aria-label": q.q });
      var slider = el("input", { type: "range", min: "0", max: "500", step: "1", value: "0", class: "fs-range", "aria-label": q.q + " (slider)" });
      var unsure = optionButton("not_sure", "Not sure", false, function () {}, false);
      var syncNum = function (v) {
        var n = Math.max(0, Math.min(100000, parseInt(v, 10)));
        if (isNaN(n)) { setPick(null); return; }
        num.value = n; slider.value = Math.min(n, 500);
        unsure.className = "fs-opt"; unsure.setAttribute("aria-checked", "false");
        setPick(n);
      };
      num.addEventListener("input", function () { if (num.value === "") setPick(null); else syncNum(num.value); });
      slider.addEventListener("input", function () { syncNum(slider.value); });
      unsure.onclick = function () {
        num.value = ""; slider.value = 0;
        unsure.className = "fs-opt is-on"; unsure.setAttribute("aria-checked", "true");
        setPick("not_sure");
      };
      body.appendChild(el("div", { class: "fs-numrow" }, [num, el("span", { class: "fs-unit", text: "employees" })]));
      body.appendChild(slider);
      body.appendChild(el("div", { class: "fs-scale" }, [el("span", { text: "0" }), el("span", { text: "500+" })]));
      body.appendChild(el("div", { class: "fs-opts fs-opts-one" }, [unsure]));
    }

    if (q.kind === "text") {
      var txt = el("input", { type: "text", class: "fs-text", maxlength: "80", autocomplete: "name", placeholder: "Your name", "aria-label": q.q });
      txt.addEventListener("input", function () {
        var v = txt.value.trim();
        setPick(v.length >= 2 ? v : null);
      });
      txt.addEventListener("keydown", function (e) { if (e.key === "Enter" && pick !== null) next.click(); });
      body.appendChild(txt);
      setTimeout(function () { txt.focus(); }, 50);
    }

    if (q.kind === "contact") {
      var em = el("input", { type: "email", class: "fs-text", maxlength: "254", autocomplete: "email", inputmode: "email", placeholder: "you@company.com", "aria-label": "Email (required)" });
      var ph = el("input", { type: "tel", class: "fs-text", maxlength: "20", autocomplete: "tel", inputmode: "tel", placeholder: "(555) 555-5555", "aria-label": "Phone (optional)" });
      var cb = el("input", { type: "checkbox", id: "fs-consent" });
      var emOk = function (v) { return /^[^@\s]{1,64}@[^@\s]+\.[a-z]{2,}$/i.test(v); };
      var phOk = function (v) { var d = v.replace(/\D/g, ""); return v.trim() === "" || (d.length >= 10 && d.length <= 15); };
      var phHint = el("small", { class: "fs-hint", text: "" });
      var sync = function () {
        var e = em.value.trim(), p = ph.value.trim();
        phHint.textContent = phOk(p) ? "" : "Please enter a full phone number, or leave it blank.";
        if (emOk(e) && phOk(p)) setPick({ email: e, phone: p, consent_calls_texts: cb.checked });
        else setPick(null);
      };
      [em, ph].forEach(function (i) { i.addEventListener("input", sync); });
      cb.addEventListener("change", sync);
      body.appendChild(el("label", { class: "fs-label" }, ["Email ", el("span", { class: "fs-req", text: "(required)" }), em]));
      body.appendChild(el("label", { class: "fs-label" }, ["Phone ", el("span", { class: "fs-req", text: "(optional)" }), ph, phHint]));
      body.appendChild(el("label", { class: "fs-consent", for: "fs-consent" }, [cb, el("span", { text: "Yes, We Are Benefits may call or text me about my results. Message and data rates may apply. I can reply STOP or email admin@wearebenefits.com to opt out anytime. This is optional and not a condition of anything." })]));
      setTimeout(function () { em.focus(); }, 50);
    }

    if (q.kind === "state") {
      var sel = el("select", { class: "fs-select", "aria-label": q.q }, [el("option", { value: "", text: "Choose a state" })].concat(
        STATES.map(function (s) { return el("option", { value: s, text: STATE_NAMES[s] }); })));
      sel.addEventListener("change", function () { setPick(sel.value || null); });
      body.appendChild(sel);
    }

    if (q.kind === "states") {
      var chosen = [];
      var wrap = el("div", { class: "fs-states", role: "group", "aria-label": q.q });
      var drawS = function () {
        wrap.innerHTML = "";
        ["CA"].concat(STATES.filter(function (s) { return s !== "CA"; })).forEach(function (s) {
          var on = chosen.indexOf(s) > -1;
          wrap.appendChild(el("button", { type: "button", class: "fs-chip" + (on ? " is-on" : ""), role: "checkbox", "aria-checked": on ? "true" : "false",
            title: STATE_NAMES[s],
            onclick: function () {
              chosen = chosen.filter(function (x) { return x !== "not_sure"; });
              if (on) chosen = chosen.filter(function (x) { return x !== s; }); else chosen.push(s);
              setPick(chosen.slice()); drawS();
            } }, [s]));
        });
        var ns = chosen.indexOf("not_sure") > -1;
        wrap.appendChild(el("button", { type: "button", class: "fs-chip fs-chip-wide" + (ns ? " is-on" : ""), role: "checkbox", "aria-checked": ns ? "true" : "false",
          onclick: function () { chosen = ns ? [] : ["not_sure"]; setPick(chosen.slice()); drawS(); } }, ["Not sure"]));
      };
      drawS();
      body.appendChild(wrap);
    }

    next.addEventListener("click", function () { lockIn(q, next); });

    pick = null;
    render([
      el("div", { class: "fs-progress" }, [
        el("span", { text: "Question " + (index + 1) + " of " + total }),
        el("div", { class: "fs-bar", role: "progressbar", "aria-valuemin": "0", "aria-valuemax": String(total), "aria-valuenow": String(index) },
          [el("i", { style: "width:" + Math.round(index / total * 100) + "%" })])
      ]),
      el("h2", { class: "fs-q", text: q.q }),
      el("p", { class: "fs-why", text: q.why }),
      body,
      el("div", { class: "fs-actions" }, [next, el("small", { class: "fs-locknote", text: "Your answer locks when you press this." })])
    ]);
  }

  function lockIn(q, btn) {
    if (busy || pick === null) return;
    busy = true;
    btn.setAttribute("disabled", "disabled");
    btn.textContent = "Saving…";
    rpc("survey_answer", { p_token: token, p_question: q.id, p_answer: pick })
      .then(function (res) {
        busy = false;
        if (res && res.ok) return advance();
        if (res && (res.reason === "already_answered" || res.reason === "out_of_order")) return start(); // resync with server
        if (res && res.reason === "completed") return screenCompleted();
        if (res && res.reason === "invalid") return screenInvalid();
        btn.removeAttribute("disabled"); btn.textContent = index === survey.questions.length - 1 ? "Lock in & see my results" : "Lock in & next";
        showToast("That answer couldn't be saved. Please check it and try again.");
      })
      .catch(function (e) { busy = false; screenError(e); });
  }

  function advance() {
    index += 1;
    if (index < survey.questions.length) return screenQuestion();
    finish();
  }

  function finish() {
    render([el("div", { class: "fs-loading", text: "Getting your results…" })]);
    rpc("survey_finish", { p_token: token })
      .then(function (res) {
        if (res && res.ok) return screenResults(res.result);
        if (res && res.reason === "completed") return screenCompleted();
        return start();
      })
      .catch(screenError);
  }

  function screenInvalid() {
    screenMessage("This link isn't valid", "Please reach out to the person who sent it to you, or email admin@wearebenefits.com.");
  }
  function screenCompleted() {
    screenMessage("Thanks, you've already completed this survey", "Your answers are saved. " + CONTACT + " from We Are Benefits will be in touch.");
  }

  var FIT_COPY = {
    owner: {
      strong:   ["Looks like a strong fit", "Based on your answers, a conversation could be worth it."],
      possible: ["Possible fit", "We'll confirm a few details with you."],
      not_yet:  ["Not yet", "It doesn't look like a fit right now."]
    },
    partner: {
      strong: ["Your network looks like a strong fit", "You talk to the kinds of businesses our programs are built for."],
      good:   ["Your network looks like a good fit", "We'd love to learn more about who you work with."],
      later:  ["We're not in your area yet", "We're starting in California, with more states coming."]
    }
  };
  var NOTE_COPY = {
    outside_ca: "We're starting in California, with more states coming. We'll reach out when we're licensed in your state.",
    below_minimum: "Some programs have size minimums, so we'll check what's available for a team your size.",
    headcount_unknown: "Once we know roughly how many full-time employees you have, we can tell you more.",
    no_fulltime: "Most programs are built around full-time W-2 employees."
  };
  var PLAN_COPY = {
    A: ["Plan A", "The employer's savings play", "A wellness program built around how payroll and benefits work together, so value can flow back to your bottom line, with real wellness value for your team too."],
    B: ["Plan B", "The employee's benefits play", "An extra layer of everyday benefits for your employees and their families, built to sit alongside what you already offer."]
  };

  function screenResults(r) {
    toast.hidden = true;
    var first = (r.name || "").split(/\s+/)[0];
    var type = r.type === "partner" ? "partner" : "owner";
    var fit = (FIT_COPY[type][r.fit] || FIT_COPY[type].possible);
    var nodes = [
      el("div", { class: "fs-eyebrow", text: first ? "YOUR RESULTS, " + first.toUpperCase() : "YOUR RESULTS" }),
      el("h1", { class: "fs-title", text: fit[0] }),
      el("p", { class: "fs-lead", text: fit[1] + (r.note && NOTE_COPY[r.note] ? " " + NOTE_COPY[r.note] : "") })
    ];

    if (type === "owner" && r.fit !== "not_yet") {
      var p = PLAN_COPY[r.plan] || PLAN_COPY.B;
      nodes.push(el("div", { class: "fs-plan" }, [
        el("div", { class: "fs-plan-badge", text: p[0] }),
        el("div", null, [el("h3", { text: "Recommended: " + p[0] }), el("p", { class: "fs-plan-sub", text: p[1] }), el("p", { text: p[2] })])
      ]));
      if (typeof r.eligible === "number" && r.eligible > 0) {
        nodes.push(el("div", { class: "fs-estimate" }, [
          el("small", { text: "ESTIMATE" }),
          el("strong", { text: "About " + r.eligible.toLocaleString("en-US") }),
          el("span", { text: r.eligible === 1 ? "employee may be able to take part." : "of your employees may be able to take part." })
        ]));
      }
      nodes.push(el("p", { class: "fs-next-step", text: "Want the real numbers? The provider runs a review on your actual payroll. " + CONTACT + " will reach out to walk you through next steps." }));
    }

    if (type === "partner" && r.fit !== "later") {
      nodes.push(el("div", { class: "fs-plan" }, [
        el("div", { class: "fs-plan-badge", text: "WAB" }),
        el("div", null, [el("h3", { text: "How the referral program works" }),
          el("p", { text: "You make the introduction, we handle everything else, and you're paid an ongoing share when a referral becomes a client." })])
      ]));
      nodes.push(el("p", { class: "fs-next-step", text: CONTACT + " will reach out to walk you through it." }));
    }

    nodes.push(el("p", { class: "fs-fine", text: "This is a quick estimate based only on your answers. It is not a quote and nothing is guaranteed. Availability, eligibility and terms are set by the program providers after their review." }));
    nodes.push(el("p", { class: "fs-fine", text: "This link is now closed. You can close this page." }));
    render(nodes);
  }

  // ---------------- boot ----------------
  function start() {
    if (!token) return screenInvalid();
    rpc("survey_start", { p_token: token })
      .then(function (res) {
        if (!res || res.status === "invalid") return screenInvalid();
        if (res.status === "completed") return screenCompleted();
        survey = SURVEYS[res.type];
        if (!survey) return screenInvalid();
        var answered = res.answered || [];
        index = 0;
        while (index < survey.questions.length && answered.indexOf(survey.questions[index].id) > -1) index++;
        if (index >= survey.questions.length) return finish();   // all answered, never finished
        if (index === 0) return screenIntro();
        showToast("Welcome back. Your earlier answers are locked in.");
        screenQuestion();
      })
      .catch(screenError);
  }

  start();
})();
