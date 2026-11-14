# A Refund keeps the learner's progress

When a Refund is Approved, the learner loses access to the course (their enrollment is removed), but their lesson progress and watch history stay. If they buy the course again later, they continue where they left off. We chose this over wiping progress because buying again is a returning customer we want to keep, and deleting history can't be undone.

## Consequences

- The watch and completion data that Refund Eligibility reads are not tied to a Purchase. Progress from before a Refund therefore counts toward the limits on any later Purchase of the same course. That closes the "buy, watch, refund, repeat" loop.
