/* =====================================================================
   Brainy Trails · learning-science.js
   Khan-quality learning layer: lesson metadata, misconception detection,
   adaptive recommendations, mastery evidence, and mixed review helpers.
   Pure JS; safe for tests and offline PWA.
   ===================================================================== */
const BTLearning = (() => {
  "use strict";

  const FAMILY = {
    count: { title: "Counting means matching one number to one thing.", concrete: "Touch each object once.", visual: "Use dots, fingers, or ten frames.", abstract: "The final number names the whole group.", prereq: null },
    shape: { title: "Shapes are named by their sides, corners, and curves.", concrete: "Trace the shape with your finger.", visual: "Compare sides and corners.", abstract: "Use the shape name when the properties match.", prereq: null },
    pattern: { title: "A pattern repeats a unit.", concrete: "Clap the beat of the pattern.", visual: "Circle the repeating chunk.", abstract: "Predict the next item from the repeat.", prereq: null },
    bonds: { title: "Addition and subtraction describe joining and separating.", concrete: "Move objects together or away.", visual: "Use ten frames and number lines.", abstract: "Write the number sentence after the story makes sense.", prereq: "count.to10" },
    place: { title: "Place value tells what a digit is worth.", concrete: "Bundle ten ones into a ten.", visual: "Use base-ten blocks.", abstract: "Read tens first, then ones.", prereq: "count.to20" },
    timemoney: { title: "Time and money are measurement systems.", concrete: "Handle coins or point at clock hands.", visual: "Match parts to their values.", abstract: "Add values or read the clock rule.", prereq: "count.to20" },
    truth: { title: "True or false means checking the whole statement.", concrete: "Build the fact with objects.", visual: "Compare both sides.", abstract: "Decide only after calculating.", prereq: "add.to10" },
    hundreds: { title: "Bigger addition works when tens and ones stay organised.", concrete: "Trade ten ones for one ten.", visual: "Use base-ten blocks or columns.", abstract: "Add ones with ones and tens with tens.", prereq: "pv.tensones" },
    skipstack: { title: "Multiplication starts as equal groups and skip counting.", concrete: "Make equal piles.", visual: "Draw arrays.", abstract: "Use × for equal groups.", prereq: "add.to10" },
    measure: { title: "Measurement compares size using a unit.", concrete: "Line objects up from the same start.", visual: "Read marks or compare lengths.", abstract: "Choose the number and unit that match.", prereq: "count.compare" },
    fractions: { title: "A fraction names equal parts of one whole.", concrete: "Share a pizza or paper strip equally.", visual: "Use fraction bars, pies, and number lines.", abstract: "The top counts parts; the bottom names equal parts in the whole.", prereq: "count.compare" },
    times: { title: "Times tables are equal groups you can count efficiently.", concrete: "Build groups with counters.", visual: "Use arrays and skip-count jumps.", abstract: "a × b means a groups of b or b groups of a.", prereq: "arrays.intro" },
    sharing: { title: "Division means sharing equally or making equal groups.", concrete: "Deal objects one at a time.", visual: "Draw groups or arrays.", abstract: "Division undoes multiplication.", prereq: "mult.easy" },
    fracforge: { title: "Equivalent fractions show the same amount in different-sized parts.", concrete: "Fold matching strips.", visual: "Line up fraction bars.", abstract: "Multiply or divide numerator and denominator by the same number.", prereq: "frac.intro" },
    sizer: { title: "Perimeter and area measure different things.", concrete: "Walk around the edge or cover the inside.", visual: "Count edge units or square units.", abstract: "Perimeter is around; area is inside.", prereq: "measure.compare" },
    megamult: { title: "Big multiplication and division use place value plus known facts.", concrete: "Break numbers into tens and ones.", visual: "Use area models or partial products.", abstract: "Calculate parts, then combine.", prereq: "mult.mid" },
    decimals: { title: "Decimals are fractions with tenths and hundredths.", concrete: "Use money and base-ten grids.", visual: "Line up decimal places.", abstract: "Compare place by place from left to right.", prereq: "pv.tensones" },
    angles: { title: "Angles measure turns.", concrete: "Turn your arm or a door hinge.", visual: "Compare with right angles and straight lines.", abstract: "Use degrees to name the size of the turn.", prereq: "shape.names2d" },
    data: { title: "Graphs organise information so we can compare quickly.", concrete: "Sort real objects into groups.", visual: "Read bars from the baseline.", abstract: "Use the scale and labels before calculating.", prereq: "count.compare" },
    fracsummit: { title: "Fraction operations work when the parts are the same size.", concrete: "Combine equal-sized strips.", visual: "Find common denominators with bars.", abstract: "Add numerators only after denominators match.", prereq: "frac.equiv" },
    percent: { title: "Percent means parts out of 100.", concrete: "Use a 100-square grid.", visual: "Connect fractions, decimals, and percents.", abstract: "50% = 50/100 = 0.5.", prereq: "dec.place" },
    belowzero: { title: "Negative numbers are positions below zero.", concrete: "Use temperature or basement floors.", visual: "Move left and right on a number line.", abstract: "Adding moves right; subtracting moves left.", prereq: "numline.leap" },
    puzzle: { title: "Multi-step maths rewards slow, organised thinking.", concrete: "Act out the story.", visual: "Write each step on its own line.", abstract: "Use operation rules and check the answer fits the story.", prereq: "add.to100" },
  };

  function familyFor(skill) { return FAMILY[skill.unit] || FAMILY.count; }

  function lessonFor(id, skill) {
    const f = familyFor(skill);
    return {
      id,
      objective: `I can solve ${skill.name.toLowerCase()} problems and explain my thinking.`,
      title: f.title,
      steps: [
        `Concrete: ${f.concrete}`,
        `Visual: ${f.visual}`,
        `Abstract: ${f.abstract}`,
      ],
      worked: [
        `Read the question and say what it is asking.`,
        `Build or picture the maths before choosing an answer.`,
        `Check that the answer makes sense.`
      ],
      representations: ["Concrete", "Visual", "Abstract"],
      prereq: skill.prereqs[0] || f.prereq || null,
    };
  }

  function augment(BT) {
    if (!BT || !BT.SKILLS) return BT;
    Object.entries(BT.SKILLS).forEach(([id, skill]) => {
      if (!skill.lesson) skill.lesson = lessonFor(id, skill);
      if (!skill.masteryEvidence) skill.masteryEvidence = { accuracy: 0.9, sessions: 2, retentionReviews: 2, transfer: true };
    });
    BT.LEARNING = { version: 1, target: "Learn → Guided Practice → Independent Practice → Mastery → Review" };
    return BT;
  }

  function numeric(v) { const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, "")); return Number.isFinite(n) ? n : null; }

  function detectMisconception(skillId, answer, correct, context) {
    const got = numeric(answer), want = numeric(correct);
    const q = context || {};
    const prompt = String(q.prompt || "");
    if (got === null || want === null) return null;
    if (/\+/.test(prompt) && String(Math.trunc(got)) === prompt.match(/\d+/g)?.slice(0,2).join("")) {
      return { type: "digit-concatenation", explanation: "You joined the digits. Addition means combining amounts, not sticking numerals together.", remediation: "Use objects or a ten frame, then count the total.", prerequisite: "count.to10" };
    }
    if (/−|-/.test(prompt) && got > want) return { type: "subtraction-direction", explanation: "Subtraction makes the starting amount smaller here.", remediation: "Start with the first number and count back slowly.", prerequisite: "sub.to10" };
    if (/×/.test(prompt) && got > 0 && want > 0 && want % got === 0) return { type: "single-group-count", explanation: "You may have counted one group instead of all equal groups.", remediation: "Draw an array and count every row or column.", prerequisite: "arrays.intro" };
    if (/÷/.test(prompt) && got === 0) return { type: "division-as-zero", explanation: "Sharing equally does not usually leave zero in each group.", remediation: "Deal counters one at a time into equal groups.", prerequisite: "div.share" };
    if (/\//.test(prompt) && got !== want) return { type: "fraction-size", explanation: "With fractions, the denominator names the size of the parts. Bigger denominators can mean smaller pieces.", remediation: "Compare with fraction bars before using symbols.", prerequisite: "frac.intro" };
    if (Math.abs(got - want) === 1) return { type: "off-by-one", explanation: "This is one away. Check whether you started counting from the first number or the next number.", remediation: "Use a number line and mark every jump.", prerequisite: skillId };
    return { type: "needs-worked-example", explanation: "This answer does not match the model yet.", remediation: "Review the worked steps, then try a simpler version.", prerequisite: skillId };
  }

  function recordAttempt(profile, skillId, ok, meta) {
    if (!profile) return;
    const st = profile.skills[skillId] || (profile.skills[skillId] = { m: 0, attempts: 0, correct: 0, stars: 0, nextReview: null, reviewStep: 0 });
    st.evidence = st.evidence || { sessions: 0, firstTryCorrect: 0, transferCorrect: 0, retentionCorrect: 0, misconceptions: {}, history: [] };
    st.evidence.history.push({ at: new Date().toISOString(), ok: !!ok, kind: meta?.kind || "practice", d: meta?.d || 0, firstTry: !!meta?.firstTry });
    st.evidence.history = st.evidence.history.slice(-30);
    if (ok && meta?.firstTry) st.evidence.firstTryCorrect++;
    if (ok && meta?.kind === "review") st.evidence.retentionCorrect++;
    if (meta?.misconception) st.evidence.misconceptions[meta.misconception.type] = (st.evidence.misconceptions[meta.misconception.type] || 0) + 1;
  }

  function masteryStatus(st) {
    if (!st || !st.attempts) return { label: "Not Started", retentionRisk: "unknown", accuracy: 0 };
    const accuracy = st.correct / st.attempts;
    const ev = st.evidence || {};
    const label = st.m >= 3 && accuracy >= 0.9 && (ev.retentionCorrect || 0) >= 2 ? "Fluent" : st.m >= 3 ? "Mastered" : st.m >= 2 ? "Proficient" : st.m >= 1 ? "Developing" : "Emerging";
    const risk = st.m >= 2 && st.nextReview && st.nextReview <= new Date().toISOString().slice(0,10) ? "high" : accuracy < 0.75 ? "medium" : "low";
    return { label, retentionRisk: risk, accuracy };
  }

  function recommendNextSkill(profile, BT, currentId) {
    if (!profile || !BT?.SKILLS) return currentId || "count.to10";
    const cur = currentId && BT.SKILLS[currentId];
    const prereq = cur?.lesson?.prereq || cur?.prereqs?.[0];
    if (prereq && BT.SKILLS[prereq]) {
      const pst = profile.skills[prereq];
      if (!pst || pst.m < 1 || (pst.attempts >= 4 && pst.correct / pst.attempts < 0.7)) return prereq;
    }
    const weak = Object.entries(profile.skills).filter(([id, st]) => BT.SKILLS[id] && st.attempts >= 5 && st.correct / st.attempts < 0.75).sort((a,b)=>a[1].correct/a[1].attempts-b[1].correct/b[1].attempts)[0];
    return weak ? weak[0] : currentId || Object.keys(BT.SKILLS)[0];
  }

  function generateMixedReviewSet(profile, BT, seedId, count = 7) {
    const out = [];
    const add = id => { if (id && BT.SKILLS[id] && !out.includes(id)) out.push(id); };
    add(seedId);
    const seed = BT.SKILLS[seedId];
    (seed?.prereqs || []).forEach(add);
    Object.entries(profile?.skills || {}).filter(([id, st]) => BT.SKILLS[id] && st.m >= 1).sort((a,b)=>(a[1].nextReview || "9999") > (b[1].nextReview || "9999") ? 1 : -1).forEach(([id]) => add(id));
    while (out.length < count) add(Object.keys(BT.SKILLS)[out.length % Object.keys(BT.SKILLS).length]);
    return out.slice(0, count);
  }

  return { augment, lessonFor, detectMisconception, recordAttempt, masteryStatus, recommendNextSkill, generateMixedReviewSet };
})();

if (typeof window !== "undefined") window.BTLearning = BTLearning;
if (typeof module !== "undefined" && module.exports) module.exports = BTLearning;
