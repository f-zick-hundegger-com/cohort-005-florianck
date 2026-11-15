# Course Platform

An online course platform where learners buy courses and instructors publish them.

## Purchases and money back

**Purchase**:
A learner's payment for one course.
_Avoid_: Offer, order

**Refund**:
A learner asking for their money back on one Purchase, and our decision on that request.
_Avoid_: Cancellation, reversal, chargeback, refund request (as a separate term)

**Requested Refund**:
A Refund the learner has asked for that nobody has decided on yet. A Purchase has at most one at a time.
_Avoid_: Pending refund, open refund

**Approved Refund**:
A Refund an admin or the course's instructor has decided to pay back in full. Nothing is confirmed as sent yet: that only happens when it becomes a Paid Refund. Once a Refund is Approved, the Purchase cannot be refunded again.

**Paid Refund**:
A Refund whose Payment Provider has confirmed the money was sent back to the learner. Every Paid Refund was Approved first.
_Avoid_: Issued refund, completed refund, closed refund, processed refund

**Refund Payment**:
One try at sending an Approved Refund's money back through the Payment Provider. A Refund can have several; it becomes a Paid Refund when one succeeds.
_Avoid_: Payout, transfer, payment attempt

**Declined Refund**:
A Refund we have turned down, with a reason given to the learner; nothing is paid back. The learner may ask again while still inside the Refund Window.
_Avoid_: Rejected refund, denied refund

**Refund Window**:
The days after a Purchase during which the learner may ask for a Refund.
_Avoid_: Cancel window, cancellation period

**Refund Eligibility**:
Whether a Purchase can be refunded right now.
_Avoid_: Cancellation offer

**Refundable Amount**:
The money we would pay back if a Refund on this Purchase were Approved.
_Avoid_: Cancellation amount, offer

**Payment Provider**:
The outside service that actually moves money for us, such as Stripe. Which one we use can change; the meaning of a Refund does not.
_Avoid_: Gateway, processor, PSP

**Chargeback**:
The cardholder's bank pulling money back for a Purchase without going through us. Reserved: the platform does not handle chargebacks yet.
_Avoid_: Using it for a learner's request (that is a Refund)

## Notifications

**Notification**:
A message addressed to one user about something that happened on the platform, which they find in the app later and which stays there until they have dealt with it. Notifications exist only inside the app.
_Avoid_: Alert, message, toast (a toast is the brief confirmation shown right after your own action, and is not a Notification), email

**Reminder**:
A Notification the platform sends on its own because something has not happened yet, such as a learner not returning to a course they started. Every other Notification follows something someone did.
_Avoid_: Nudge, motivational notification

**Notification Service**:
The outside service that delivers Notifications into the app for us, such as Knock. Which one we use can change; the meaning of a Notification does not.
_Avoid_: Inbox provider, notification vendor, naming the service itself when you mean the role
