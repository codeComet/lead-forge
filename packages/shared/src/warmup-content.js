// Content for warm-up mail.
//
// Warm-up goes to people the operator knows and who agreed to reply, so the
// message should read like a short personal note and invite an answer — a reply
// is the signal Gmail actually weighs. Bodies are assembled from rotating parts
// so the mailbox isn't sending the same string 15 times a day (identical
// repeated content is itself a bulk pattern), and carry no links, no images and
// no footer.

const OPENERS = [
  "Hope your week's going well.",
  "Hope you're doing alright.",
  "Hope all's good on your end.",
  "Quick one, no rush at all.",
  "Hope things are calm-ish over there.",
];

const TOPICS = [
  "I'm getting a new work mailbox set up and I'm checking that mail from it actually reaches people properly.",
  "I've moved my email over to a new domain and I'm making sure nothing lands in the wrong folder.",
  "Setting up email on a new domain this week — testing that it arrives where it should.",
  "I'm sorting out email deliverability for my new address and could use a sanity check.",
  "New sending setup on my side; I'm verifying it behaves before I use it for real work.",
];

const ASKS = [
  "Could you hit reply with anything at all — even one word? That's all I need.",
  "If you get a sec, just reply with a word or two so I know it came through.",
  "A quick reply (literally 'got it' is fine) would help a lot.",
  "Mind replying briefly so I can confirm it arrived? Anything works.",
  "Just reply with whatever, so I can tick this off.",
];

const EXTRAS = [
  "And if it turned up in spam or promotions, dragging it to the main inbox helps too.",
  "If it landed anywhere other than your main inbox, moving it over would help.",
  "If it went to spam, marking it 'not spam' would be a big help.",
  "",
  "",
];

const SUBJECTS = [
  "Quick favour",
  "Quick one",
  "Mind replying to this?",
  "Testing my new work email",
  "Small favour, 10 seconds",
  "Checking this reaches you",
  "Quick check",
];

const SIGNOFFS = ["Thanks!", "Cheers,", "Thanks a lot,", "Appreciate it,"];

function pick(list, rand) {
  return list[Math.floor(rand() * list.length) % list.length];
}

/**
 * A short personal warm-up email.
 * @param name  recipient's first name, if known
 * @param from  sender name shown in the sign-off
 * @param rand  injectable RNG for deterministic tests
 * @returns { subject, body } — body is plain text; the send path converts it.
 */
export function warmupEmail({ name, from = "", rand = Math.random } = {}) {
  const greeting = name ? `Hi ${String(name).trim().split(/\s+/)[0]},` : "Hi,";
  const extra = pick(EXTRAS, rand);
  const lines = [
    greeting,
    "",
    `${pick(OPENERS, rand)} ${pick(TOPICS, rand)}`,
    "",
    extra ? `${pick(ASKS, rand)} ${extra}` : pick(ASKS, rand),
    "",
    pick(SIGNOFFS, rand),
    from.replace(/\s*<[^>]*>\s*$/, "").trim(),
  ];
  return { subject: pick(SUBJECTS, rand), body: lines.filter((l) => l !== undefined).join("\n") };
}
