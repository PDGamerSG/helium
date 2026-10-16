# Real meetings: the AMI Meeting Corpus, series ES2002

Four real recorded meetings of one design team (the `remote` tenant): a project manager, a marketing expert, a user
interface designer and an industrial designer design a television remote control over a kickoff, a functional design
meeting, a conceptual design meeting and a detailed design meeting. Recorded on 13 December 2004 at the University of
Edinburgh for the AMI Meeting Corpus (CC BY 4.0, https://groups.inf.ed.ac.uk/ami/corpus/).

## Where the files come from

`data/ami/fetch_ami.py` reads the corpus's own manual annotation release
(`ami_public_manual_1.6.2.zip`, 23 MB, downloaded once into `data/ami/cache/`):

- `words/<meeting>.<A-D>.words.xml`: every word with its start and end time, per speaker headset channel;
- `segments/<meeting>.<A-D>.segments.xml`: the transcribers' utterance boundaries (word id ranges);
- `corpusResources/meetings.xml`: participants, their scenario roles (PM, ME, UI, ID) and the recording date.

Words are joined per utterance with punctuation attached, sentence starts are capitalised, and the utterances of the
four channels are merged in time order into one recorder export per meeting (`data/meetings/remote_001.json` to
`remote_004.json`), plus `remote_roster.json`. The speakers' first names are the ones they give in the kickoff
("Hi, I'm David and I'm supposed to be an industrial designer"); the corpus participant ids remain in the speaker ids.
With `--audio` the mixed headset recording of each meeting (16 kHz mono WAV, 40 to 75 MB) is downloaded next to the
JSON so "play at timestamp" plays the real audio. The WAVs and the zip are git-ignored.

```bash
python data/ami/fetch_ami.py --series ES2002 --tenant remote --audio
uv run --package helium-api python data/seed.py --tenants remote --reset --extract gold   # or --extract real
```

| meeting | title | recorded | utterances | speakers | duration |
|---|---|---|---|---|---|
| ES2002a | kickoff | 13-12-04 | 236 | 4 | 18.5 min |
| ES2002b | functional design | 13-12-04 | 432 | 4 | 36.1 min |
| ES2002c | conceptual design | 13-12-04 | 504 | 4 | 40.1 min |
| ES2002d | detailed design | 13-12-04 | 774 | 4 | 40.0 min |

The four participants, as they introduce themselves in the kickoff: Laura (project manager, `spk_fee005`), David (industrial designer, `spk_mee006`), Craig (user interface designer, `spk_mee007`) and Andrew (marketing expert, `spk_mee008`). Utterances that overlap the next speaker's are clipped at that speaker's start so the recorder contract (non-overlapping, strictly ordered) holds; start times are untouched.

## Caveats, stated in every file's `note`

- The corpus gives the recording date but no clock time: the four meetings are placed at 10:00, 12:00, 14:00 and
  16:00 UTC on 13 December 2004, in their real order.
- The demo tenant replays reviewed labels (`data/gold/remote_001.json` to `remote_004.json`, 55 items, every one
  anchored on a verbatim quote from its utterance and checked against the corpus's own decision annotations below);
  `--extract real` runs the model instead, and `ingest.eval --files remote_001,...` scores it against those labels:
  strict precision and recall 0.02 (one exact match out of 55), subject recall 0.55. The model finds the topics but
  not the reviewed wording; details in `docs/eval/extraction.md`.
  Extraction quality on conversational speech is lower than on the scripted corpus, and a fact's provenance link
  ("play at") is the check either way.

## What the team decided, from the corpus's abstractive summaries

These are the chains the demo asks about; each later meeting revisits earlier decisions under the 12.50 Euro
production-cost cap.

| Topic | ES2002a kickoff | ES2002b functional | ES2002c conceptual | ES2002d detailed |
|---|---|---|---|---|
| Price | sells for 25 Euro; production cost at most 12.50 Euro | | | the target cost forces features out |
| Scope | | only controls televisions; no teletext | | |
| Target group | | people aged 15 to 35 | | |
| Battery | | regular batteries | kinetic battery | no kinetic battery |
| Display | | | no LCD display | no LCD display; the display is on the television |
| Buttons | | on/off, channel, volume, digits | rubber buttons; a jog dial | square push buttons, normal colour |
| Case and materials | | corporate colour and design | curvy, snowman-shaped, plastic and rubber, soft fruit-like feel | double-curved case |
| Voice | | speech recognition left open | no talk-back function | |
| Chip | | | | regular chip |

Questions that work on this tenant: "What did they decide about the battery?", "Why is there no LCD display?",
"What was true after the conceptual design meeting?" (belief at 14:30 on 13 December 2004), "Who talked about
speech recognition?".
