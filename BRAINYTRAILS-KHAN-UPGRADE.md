# Brainy Trails Khan-Quality Upgrade

This package adds a learning-science layer to Brainy Trails while preserving the existing island adventure, XP, streaks, boss battles, parent gate, offline-first storage, and local/cloud progress flow.

## What changed

### 1. Learn → Guided Practice → Practice → Mastery → Review
- Added `brainytrails/learning-science.js` as a pure, test-safe learning layer.
- Every skill is augmented at runtime with:
  - learning objective
  - mini lesson
  - concrete / visual / abstract representations
  - worked-example routine
  - mastery evidence expectations
- First-time practice now shows a short lesson card before children begin.
- Automated tests run in fast/test mode without the modal interruption.

### 2. Misconception engine
- Added `BTLearning.detectMisconception(skill, answer, correctAnswer, context)`.
- Wrong answers can now trigger targeted feedback such as:
  - digit concatenation in addition
  - subtraction direction errors
  - single-group counting in multiplication
  - fraction-size misunderstanding
  - off-by-one counting errors
- Misconceptions are stored per skill in `st.evidence.misconceptions`.

### 3. Adaptive recommendations and mixed practice
- Added `BTLearning.recommendNextSkill(profile, BT, currentId)`.
- Added `BTLearning.generateMixedReviewSet(profile, BT, seedId, count)`.
- Practice sessions can now include the focus skill, prerequisites, and previously learned skills rather than only a single repeated skill.

### 4. Stronger mastery evidence model
- Existing `m` levels are preserved for compatibility.
- Added an evidence layer with:
  - first-try correct count
  - retention correct count
  - misconception history
  - recent attempt history
  - sessions
- Added `BTLearning.masteryStatus(st)` with labels:
  - Not Started
  - Emerging
  - Developing
  - Proficient
  - Mastered
  - Fluent
- A skill becomes `Fluent` only when mastery is backed by high accuracy and retained reviews.

### 5. Parent Dashboard 2.0 insights
- Parents now see learning insights, including:
  - fluent skill count
  - spaced-review retention risk
  - most common misconception
  - recommended next activity

### 6. UI polish
- Added mini-lesson cards and a “Think” strip on questions.
- Added small CSS additions for learning cards and representation pills.

## Files changed

- `brainytrails/index.html`
  - Includes `learning-science.js`.
  - Adds lesson-card styles.

- `brainytrails/app.js`
  - Initializes learning layer.
  - Shows first-time mini lessons.
  - Records mastery evidence.
  - Adds misconception-based feedback.
  - Adds mixed practice queues.
  - Adds parent insight generation.
  - Exposes `parentInsights` for testing/debugging.

- `brainytrails/learning-science.js`
  - New pure learning-science module.

## Validation

Regression suite result:

```text
70 passed, 0 failed
```

Run from `brainytrails/`:

```bash
node tests/run-all.js
```

## Recommended next phase

This implementation establishes the learning engine foundation. The next phase should deepen individual skill content with bespoke lesson scripts, interactive manipulatives, and richer question generators per skill.
