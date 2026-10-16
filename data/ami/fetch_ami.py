"""Convert one AMI Meeting Corpus scenario series (four real design-team meetings) into Helium' recorder format.

    python data/ami/fetch_ami.py --series ES2002 --tenant remote [--audio]

Source: the AMI corpus's own manual annotation release (CC BY 4.0) at
https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip (23 MB, downloaded once into
data/ami/cache): per-word timestamps in `words/<meeting>.<A-D>.words.xml`, utterance boundaries in
`segments/<meeting>.<A-D>.segments.xml`, and participants with their scenario roles and the recording date in
`corpusResources/meetings.xml`. With `--audio`, the mixed headset recording of each meeting (16 kHz mono WAV,
about 40 MB) is downloaded from https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/<meeting>/audio/.

Output: `data/meetings/<tenant>_001.json` .. `_004.json` (parts a..d), `<tenant>_roster.json`, and with `--audio`
`<tenant>_00n.wav` next to each JSON. The corpus gives the recording date but no clock time, so meetings on the same
day are placed at 10:00, 12:00, 14:00 and 16:00 UTC in their real order; every file says so in its `note`.
Standard library only.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import time
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Tuple

ANNOTATIONS_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusAnnotations/ami_public_manual_1.6.2.zip"
AUDIO_URL = "https://groups.inf.ed.ac.uk/ami/AMICorpusMirror/amicorpus/{meeting}/audio/{meeting}.Mix-Headset.wav"
NITE = "{http://nite.sourceforge.net/}"
PARTS = ("a", "b", "c", "d")
TITLES = {"a": "kickoff", "b": "functional design", "c": "conceptual design", "d": "detailed design"}
ROLES = {"PM": "project manager", "ME": "marketing expert", "UI": "user interface designer", "ID": "industrial designer"}
START_HOURS = {"a": 10, "b": 12, "c": 14, "d": 16}
NOTE = (
    "Real transcript from the AMI Meeting Corpus (CC BY 4.0, https://groups.inf.ed.ac.uk/ami/corpus/), converted by "
    "data/ami/fetch_ami.py from the manual annotation release. The corpus records the meeting date but no clock time, so "
    "same-day meetings are placed at 10:00, 12:00, 14:00 and 16:00 UTC in their real order. Speaker names are the "
    "corpus participant ids; roles come from corpusResources/meetings.xml."
)
_ID_RANGE = re.compile(r"id\(([^)]+?)(\d+)\)(?:\.\.id\(([^)]+?)(\d+)\))?")


def log(message: str) -> None:
    print(message, file=sys.stderr, flush=True)


def download(url: str, target: Path, retries: int = 4) -> Path:
    if target.is_file() and target.stat().st_size > 0:
        return target
    target.parent.mkdir(parents=True, exist_ok=True)
    for attempt in range(1, retries + 1):
        try:
            log(f"downloading {url}")
            with urllib.request.urlopen(url, timeout=120) as response, open(target, "wb") as out:
                while True:
                    chunk = response.read(1 << 20)
                    if not chunk:
                        break
                    out.write(chunk)
            return target
        except Exception as exc:  # noqa: BLE001 - retry on any network error
            log(f"  attempt {attempt} failed: {exc}")
            if target.exists():
                target.unlink()
            time.sleep(5 * attempt)
    raise SystemExit(f"could not download {url}")


# --------------------------------------------------------------------------- corpus metadata
def read_meetings(zf: zipfile.ZipFile, series: str) -> Dict[str, dict]:
    """`{meeting_id: {date, duration, speakers: {agent: (global_name, role)}}}` for the four parts of a series."""
    root = ET.fromstring(zf.read("corpusResources/meetings.xml"))
    out: Dict[str, dict] = {}
    for meeting in root.iter("meeting"):
        observation = meeting.get("observation") or ""
        if not observation.startswith(series) or observation[len(series) :] not in PARTS:
            continue
        speakers = {}
        for speaker in meeting.findall("speaker"):
            speakers[speaker.get("nxt_agent")] = (speaker.get("global_name"), speaker.get("role"))
        out[observation] = {"date": meeting.get("dateOnly"), "duration": float(meeting.get("duration") or 0), "speakers": speakers}
    return out


def read_words(zf: zipfile.ZipFile, meeting: str, agent: str) -> Tuple[str, Dict[int, Tuple[float, float, str, bool]]]:
    """`(id prefix, {index: (start, end, text, is_punctuation)})` of one speaker channel; only `<w>` carry text."""
    name = f"words/{meeting}.{agent}.words.xml"
    if name not in zf.namelist():
        return "", {}
    root = ET.fromstring(zf.read(name))
    words: Dict[int, Tuple[float, float, str, bool]] = {}
    prefix = ""
    for w in root.iter("w"):
        wid = w.get(f"{NITE}id") or ""
        match = re.match(r"(.*?)(\d+)$", wid)
        if not match:
            continue
        prefix = match.group(1)
        text = (w.text or "").strip()
        if not text:
            continue
        start = float(w.get("starttime") or 0.0)
        end = float(w.get("endtime") or start)
        words[int(match.group(2))] = (start, end, text, w.get("punc") == "true")
    return prefix, words


def read_segments(zf: zipfile.ZipFile, meeting: str, agent: str) -> List[Tuple[float, float, int, int]]:
    """`[(start, end, first word index, last word index)]` of one speaker channel."""
    name = f"segments/{meeting}.{agent}.segments.xml"
    if name not in zf.namelist():
        return []
    root = ET.fromstring(zf.read(name))
    out = []
    for seg in root.iter("segment"):
        child = seg.find(f"{NITE}child")
        if child is None:
            continue
        match = _ID_RANGE.search(child.get("href") or "")
        if not match:
            continue
        first = int(match.group(2))
        last = int(match.group(4)) if match.group(4) else first
        start = float(seg.get("transcriber_start") or seg.get("starttime") or 0.0)
        end = float(seg.get("transcriber_end") or seg.get("endtime") or start)
        out.append((start, end, first, last))
    return out


def join_words(words: Dict[int, Tuple[float, float, str, bool]], first: int, last: int) -> Tuple[str, Optional[float], Optional[float]]:
    """Words joined with spaces, punctuation attached to the word before it; returns (text, first start, last end)."""
    parts: List[str] = []
    start = end = None
    for index in range(first, last + 1):
        entry = words.get(index)
        if entry is None:
            continue
        w_start, w_end, text, punc = entry
        start = w_start if start is None else start
        end = w_end if end is None else max(end, w_end)
        if punc and parts:
            parts[-1] += text
        else:
            parts.append(text)
    return " ".join(parts), start, end


def tidy(text: str) -> str:
    """Capitalise sentence starts; the corpus already has case and punctuation."""
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1].upper() + text[1:] if text else text


# --------------------------------------------------------------------------- conversion
def convert_meeting(zf: zipfile.ZipFile, meeting: str, meta: dict) -> List[dict]:
    segments: List[dict] = []
    for agent, (global_name, _role) in sorted(meta["speakers"].items()):
        _prefix, words = read_words(zf, meeting, agent)
        for seg_start, seg_end, first, last in read_segments(zf, meeting, agent):
            text, w_start, w_end = join_words(words, first, last)
            text = tidy(text)
            if not text or not re.search(r"[A-Za-z0-9]", text):
                continue
            start = w_start if w_start is not None else seg_start
            end = w_end if w_end is not None else seg_end
            if end < start:
                end = start
            segments.append({"start_ms": int(round(start * 1000)), "end_ms": int(round(end * 1000)), "speaker_id": f"spk_{global_name.lower()}", "text": text})
    segments.sort(key=lambda s: (s["start_ms"], s["end_ms"]))
    # The recorder contract wants non-overlapping utterances; people talk over each other in real meetings.
    # Start times stay real (they drive "play at"); an utterance that is still running when the next one starts is
    # clipped at that start, so the sequence is monotonic and nothing is dropped.
    previous = None
    for seg in segments:
        if previous is not None:
            if seg["start_ms"] <= previous["start_ms"]:
                seg["start_ms"] = previous["start_ms"] + 1  # two utterances starting in the same millisecond
            if previous["end_ms"] > seg["start_ms"]:
                previous["end_ms"] = seg["start_ms"]
        if seg["end_ms"] <= seg["start_ms"]:
            seg["end_ms"] = seg["start_ms"] + 1
        previous = seg
    return segments


_INTRO = re.compile(r"\b(?:I'm|I am|my name is|this is)\s+([A-Z][a-z]+)\b")


def introduced_names(segments: List[dict]) -> Dict[str, str]:
    """First names the participants give themselves in the kickoff ("Hi, I'm David and I'm ..."), per speaker id."""
    names: Dict[str, str] = {}
    for seg in segments:
        sid = seg["speaker_id"]
        if sid in names:
            continue
        match = _INTRO.search(seg["text"])
        if match and match.group(1) not in {"The", "This", "That", "Just", "Not", "Going", "Gonna", "Sure", "Okay"}:
            names[sid] = match.group(1)
    return names


def meeting_date(date_only: Optional[str], part: str) -> datetime:
    """`dd-mm-yy` from the corpus (2004/2005 recordings) at the part's placeholder hour, UTC."""
    try:
        day, month, year = (int(x) for x in (date_only or "").split("-"))
        base = datetime(2000 + year, month, day, tzinfo=timezone.utc)
    except ValueError:
        base = datetime(2004, 12, 13, tzinfo=timezone.utc)
    return base.replace(hour=START_HOURS[part])


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--series", default="ES2002", help="AMI scenario series, e.g. ES2002 (parts a..d)")
    parser.add_argument("--tenant", default="remote", help="tenant slug used in the file names and ids")
    parser.add_argument("--out", default="data/meetings")
    parser.add_argument("--cache", default="data/ami/cache", help="where the annotation zip is kept")
    parser.add_argument("--audio", action="store_true", help="also download the mixed headset WAV of each meeting")
    parser.add_argument("--max-segments", type=int, default=None, help="truncate each meeting (smoke tests)")
    args = parser.parse_args()

    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    zip_path = download(ANNOTATIONS_URL, Path(args.cache) / "ami_public_manual_1.6.2.zip")
    zf = zipfile.ZipFile(zip_path)
    meetings = read_meetings(zf, args.series)
    missing = [args.series + p for p in PARTS if args.series + p not in meetings]
    if missing:
        raise SystemExit(f"series {args.series}: missing meetings {missing} in the corpus metadata")

    first = meetings[args.series + "a"]
    names = introduced_names(convert_meeting(zf, args.series + "a", first))
    roster = []
    for agent, (global_name, role) in sorted(first["speakers"].items()):
        sid = f"spk_{global_name.lower()}"
        roster.append({"id": sid, "name": names.get(sid, global_name), "role": ROLES.get(role or "", "participant"), "email": f"{global_name.lower()}@{args.tenant}.example"})
    display = {r["id"]: r["name"] for r in roster}
    (out_dir / f"{args.tenant}_roster.json").write_text(json.dumps(roster, indent=2) + "\n", encoding="utf-8")

    rows = []
    for index, part in enumerate(PARTS, start=1):
        meeting = args.series + part
        meta = meetings[meeting]
        segments = convert_meeting(zf, meeting, meta)
        if args.max_segments:
            segments = segments[: args.max_segments]
        started = meeting_date(meta["date"], part)
        last_end = max((s["end_ms"] for s in segments), default=int(meta["duration"] * 1000))
        ended = started + timedelta(milliseconds=last_end)
        speakers = [
            {"id": f"spk_{g.lower()}", "name": display.get(f"spk_{g.lower()}", g), "role": ROLES.get(r or "", "participant")}
            for _agent, (g, r) in sorted(meta["speakers"].items())
        ]
        wav_name = f"{args.tenant}_{index:03d}.wav"
        export = {
            "version": 1,
            "note": NOTE,
            "source": {"corpus": "AMI Meeting Corpus", "meeting": meeting, "recorded_on": meta["date"], "licence": "CC BY 4.0"},
            "meeting": {
                "id": f"mtg_{args.tenant}_{index:03d}",
                "title": f"{meeting}: {TITLES[part]}",
                "started_at": started.isoformat(),
                "ended_at": ended.isoformat(),
                "audio_uri": f"data/meetings/{wav_name}",
            },
            "speakers": speakers,
            "segments": segments,
        }
        (out_dir / f"{args.tenant}_{index:03d}.json").write_text(json.dumps(export, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        audio_state = "skipped"
        if args.audio:
            wav = download(AUDIO_URL.format(meeting=meeting), out_dir / wav_name)
            audio_state = f"{wav.stat().st_size / 1e6:.1f} MB"
        rows.append((meeting, meta["date"], len(segments), len(speakers), last_end / 60000, audio_state))
        log(f"{meeting}: {len(segments)} segments, {len(speakers)} speakers, {last_end / 60000:.1f} min, audio {audio_state}")

    print("| meeting | recorded | segments | speakers | duration (min) | audio |")
    print("|---|---|---|---|---|---|")
    for meeting, date, n, k, helium, audio in rows:
        print(f"| {meeting} | {date} | {n} | {k} | {helium:.1f} | {audio} |")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
