# QADB glossary

Shared vocabulary for the generic Q&A refactor. Use these terms in conversation, docs, code and UI.

**Status: confirmed** on 2026-11-26.

## Structure

| Term | Meaning | Front-end example | Also considered |
|---|---|---|---|
| **Scenario** | An isolated question set owned by one user, with its own attributes and questions. | "Front-end interview questions" | Question bank, Deck, Collection |
| **Attribute** | A column the user defines on a scenario to describe its questions. A scenario has its own list of attributes. | Difficulty, Importance, Category | Column, Field, Dimension, Property |
| **Option** | One allowed value of an attribute. Has a label, a color and a position. | Easy, Medium, Hard | Value, Choice |
| **Selection mode** | Whether a question takes one option (**single**) or several (**multiple**) for an attribute. | Difficulty: single. Category: multiple | Cardinality |
| **Ordered attribute** | An attribute whose option order has meaning, so questions can be sorted by it. | Difficulty: ordered. Category: not ordered | Ranked, Scale |
| **Default option** | The option preselected when adding a question. | Medium, Mid, JS | |
| **Required attribute** | A per-attribute switch: every question must have an option for it. | Difficulty, Importance, Category: all required | |
| **Incomplete question** | A question with no option for one or more required attributes, usually after the scenario was edited. A filter lists these so they can be fixed. | | Needs attention, Unclassified |

## Fixed parts (same in every scenario)

| Term | Meaning |
|---|---|
| **Question** | The prompt text. |
| **Answer** | The Markdown answer (stored today as `answer_summary`). |
| **Link** | Optional URL to the original source. |
| **Mastered** | Manual flag on a question. |
| **Attempt** | One recorded practice result: correct or incorrect, with a timestamp. |
| **Track record** | Statistics derived from attempts: times practiced, % correct, last result. |
| **Practice session** | A run through a queue of questions, either selected or random. |
