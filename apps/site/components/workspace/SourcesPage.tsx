"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { IconMail, IconMic, IconPause, IconPlay } from "@/components/icons";
import { useResource } from "@/lib/api";
import { fmtDate, fmtDay, fmtObject, fmtOffset, fmtTime, predicateLabel } from "@/lib/format";
import type { Episode, Fact, Meeting, Message, Thread } from "@/lib/types";
import { useWorkspace } from "./context";
import { StatusMark } from "./marks";
import { Empty, ErrorState, Loading } from "./states";

/** A player in the workspace palette. It stays out of sight until the recording's metadata loads. */
function Player({
  src,
  audioRef,
  onAvailability,
  onPause,
}: {
  src: string;
  audioRef: React.RefObject<HTMLAudioElement | null>;
  onAvailability: (ok: boolean) => void;
  onPause: () => void;
}) {
  const [state, setState] = useState<"loading" | "ready" | "none">("loading");
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [d, setD] = useState(0);
  return (
    <div className="mb-5">
      <audio
        ref={audioRef}
        preload="metadata"
        src={src}
        onLoadedMetadata={(e) => {
          setD(e.currentTarget.duration || 0);
          setState("ready");
          onAvailability(true);
        }}
        onError={() => {
          setState("none");
          onAvailability(false);
        }}
        onTimeUpdate={(e) => setT(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => {
          setPlaying(false);
          onPause();
        }}
        className="hidden"
      />
      {state === "none" ? (
        <p className="text-[0.86rem] text-coal-3">No recording is stored for this meeting, so playback is off. The transcript below is the source.</p>
      ) : state === "ready" ? (
        <div className="flex items-center gap-4 rounded-[10px] border rule bg-white px-3 py-2.5">
          <button
            type="button"
            onClick={() => {
              const a = audioRef.current;
              if (!a) return;
              if (a.paused) void a.play();
              else a.pause();
            }}
            aria-label={playing ? "Pause recording" : "Play recording"}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-coal text-white transition-transform active:scale-95"
          >
            {playing ? <IconPause size={14} /> : <IconPlay size={14} />}
          </button>
          <span className="t-num w-[6.5rem] shrink-0 text-[0.86rem] text-coal-2">
            {fmtOffset(t * 1000)} / {fmtOffset(d * 1000)}
          </span>
          <label className="sr-only" htmlFor="scrub">
            Position in the recording
          </label>
          <input
            id="scrub"
            type="range"
            min={0}
            max={d || 0}
            step={0.1}
            value={Math.min(t, d || 0)}
            onChange={(e) => {
              const a = audioRef.current;
              if (a) a.currentTime = Number(e.target.value);
            }}
            aria-valuetext={fmtOffset(t * 1000)}
            className="scrub h-6 w-full cursor-pointer"
            style={{ ["--fill" as string]: `${d ? (t / d) * 100 : 0}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function Transcript({ meeting, at }: { meeting: Meeting; at: string | null }) {
  const { tenant } = useWorkspace();
  const eps = useResource<Episode[]>(`/tenants/${tenant}/meetings/${encodeURIComponent(meeting.id)}/episodes`);
  const audio = useRef<HTMLAudioElement>(null);
  const [hasAudio, setHasAudio] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    if (!at || !eps.data) return;
    document.getElementById(`ep-${at}`)?.scrollIntoView({ block: "center" });
  }, [at, eps.data]);

  const play = (ep: Episode) => {
    const a = audio.current;
    if (!a) return;
    a.currentTime = ep.t_start / 1000;
    void a.play();
    setPlaying(ep.id);
  };

  return (
    <div>
      <Player
        src={`/api/helium/tenants/${tenant}/meetings/${encodeURIComponent(meeting.id)}/audio`}
        audioRef={audio}
        onAvailability={setHasAudio}
        onPause={() => setPlaying(null)}
      />
      {eps.error ? (
        <ErrorState error={eps.error} onRetry={eps.reload} />
      ) : !eps.data ? (
        <Loading rows={6} />
      ) : (
        <ol className="space-y-1">
          {eps.data.map((ep) => (
            <li
              key={ep.id}
              id={`ep-${ep.id}`}
              className={`grid grid-cols-[4.5rem_minmax(0,1fr)] gap-4 rounded-[10px] px-3 py-2.5 ${ep.id === at ? "bg-signal-soft ring-1 ring-[rgb(255_90_31/0.3)]" : ""}`}
            >
              <button
                type="button"
                onClick={() => play(ep)}
                disabled={!hasAudio}
                aria-label={`Play from ${fmtOffset(ep.t_start)}`}
                className="t-num flex h-7 items-center gap-1.5 self-start rounded-[6px] text-[0.82rem] text-coal-3 enabled:hover:text-coal disabled:cursor-default"
              >
                {hasAudio ? <IconPlay size={12} className={playing === ep.id ? "text-signal" : ""} /> : null}
                {fmtOffset(ep.t_start)}
              </button>
              <p className="text-[0.98rem] leading-relaxed text-coal-2">
                <span className="font-semibold text-coal">{ep.speaker.name}</span> <span className="t-quote text-[1.06rem]">{ep.text}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ThreadView({ thread, at }: { thread: Thread; at: string | null }) {
  const { tenant } = useWorkspace();
  const msgs = useResource<Message[]>(`/tenants/${tenant}/threads/${encodeURIComponent(thread.id)}/messages`);
  useEffect(() => {
    if (!at || !msgs.data) return;
    document.getElementById(`ep-${at}`)?.scrollIntoView({ block: "center" });
  }, [at, msgs.data]);
  if (msgs.error) return <ErrorState error={msgs.error} onRetry={msgs.reload} />;
  if (!msgs.data) return <Loading rows={4} />;
  return (
    <ol className="space-y-4">
      {msgs.data.map((m) => (
        <li key={m.id} id={`ep-${m.id}`} className={`sheet p-5 ${m.id === at ? "ring-2 ring-[rgb(255_90_31/0.45)]" : ""}`}>
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[0.86rem] text-coal-2">
            <p>
              <span className="font-semibold text-coal">{m.sender.name}</span> to {m.to.map((x) => x.name).join(", ")}
              {m.cc.length ? `, copying ${m.cc.map((x) => x.name).join(", ")}` : ""}
            </p>
            <p className="t-num">
              {fmtDay(m.sent_at)}, {fmtTime(m.sent_at)}
            </p>
          </div>
          <p className="mt-3 whitespace-pre-line text-[0.98rem] leading-relaxed text-coal">{m.text}</p>
        </li>
      ))}
    </ol>
  );
}

export function SourcesPage() {
  const { tenant, openWhy } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const meetings = useResource<Meeting[]>(`/tenants/${tenant}/meetings`);
  const threads = useResource<Thread[]>(`/tenants/${tenant}/threads`);
  const facts = useResource<Fact[]>(`/tenants/${tenant}/facts?status=all`);
  const open = params.get("open") ?? params.get("meeting") ?? params.get("thread");
  const at = params.get("at") ?? params.get("message");

  const items = useMemo(() => {
    const list = [
      ...(meetings.data ?? []).map((m) => ({
        kind: "meeting" as const,
        id: m.id,
        title: m.title,
        t: m.started_at,
        meta: `${m.episodes} utterances, ${m.facts} facts`,
        m,
      })),
      ...(threads.data ?? []).map((t) => ({
        kind: "email" as const,
        id: t.id,
        title: t.subject,
        t: t.started_at ?? 0,
        meta: `${t.messages ?? 0} messages${t.facts != null ? `, ${t.facts} facts` : ""}`,
        th: t,
      })),
    ];
    return list.sort((a, b) => a.t - b.t);
  }, [meetings.data, threads.data]);

  const selected = items.find((i) => i.id === open) ?? items[0];
  const derived = useMemo(
    () =>
      (facts.data ?? [])
        .filter((f) => selected && (f.meeting?.id === selected.id || f.thread?.id === selected.id || f.source?.container?.id === selected.id))
        .sort((a, b) => a.valid_from - b.valid_from),
    [facts.data, selected],
  );

  const choose = (id: string) => router.replace(`${pathname}?open=${encodeURIComponent(id)}`, { scroll: false });
  const err = meetings.error ?? threads.error;

  return (
    <div className="grid min-h-full lg:grid-cols-[21rem_minmax(0,1fr)]">
      <aside aria-label="Evidence" className="border-b rule bg-paper-2/70 lg:sticky lg:top-0 lg:h-[calc(100svh-4rem)] lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="px-5 pb-3 pt-7">
          <h1 className="text-[1.4rem] font-semibold tracking-[-0.035em] text-coal">
            Evidence
          </h1>
          <p className="mt-1 text-[0.88rem] text-coal-3">Every fact points back to one of these, oldest first.</p>
        </div>
        {err ? (
          <div className="p-5">
            <ErrorState error={err} />
          </div>
        ) : !meetings.data || !threads.data ? (
          <div className="p-5">
            <Loading rows={6} />
          </div>
        ) : (
          <ul className="px-2 pb-6">
            {items.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => choose(i.id)}
                  aria-current={selected?.id === i.id ? "true" : undefined}
                  className={`flex w-full items-start gap-3 rounded-[10px] px-3 py-2.5 text-left transition-colors ${selected?.id === i.id ? "bg-paper-3" : "hover:bg-paper-2"}`}
                >
                  <span className="mt-0.5 text-coal-3">{i.kind === "email" ? <IconMail size={16} /> : <IconMic size={16} />}</span>
                  <span className="min-w-0">
                    <span className="block text-[0.94rem] font-semibold leading-snug text-coal">{i.title}</span>
                    <span className="t-num block text-[0.8rem] text-coal-3">
                      {fmtDay(i.t)}, {i.meta}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="min-w-0 px-5 pb-20 pt-8 sm:px-8 lg:px-12">
        {!selected ? (
          meetings.data && threads.data ? (
            <Empty title="No sources yet">Import a recorder export or an email thread to start the record.</Empty>
          ) : null
        ) : (
          <>
            <p className="flex items-center gap-2 text-[0.88rem] text-coal-3">
              {selected.kind === "email" ? <IconMail size={16} /> : <IconMic size={16} />}
              {selected.kind === "email" ? "Email thread" : "Meeting"}, {fmtDate(selected.t)}
            </p>
            <h2
              className="mt-2 max-w-[40ch] text-[clamp(1.6rem,2.6vw,2.1rem)] font-semibold leading-tight tracking-[-0.04em] text-coal"
            >
              {selected.title}
            </h2>

            <div className="mt-8 grid gap-10 xl:grid-cols-[minmax(0,1fr)_18rem]">
              <div className="min-w-0">
                {selected.kind === "meeting" ? (
                  <Transcript key={selected.id} meeting={selected.m!} at={at} />
                ) : (
                  <ThreadView key={selected.id} thread={selected.th!} at={at} />
                )}
              </div>
              <aside aria-label="Facts from this source" className="xl:sticky xl:top-6 xl:self-start">
                <h3 className="text-[0.95rem] font-semibold text-coal">
                  Facts from this source <span className="t-num text-coal-3">{derived.length}</span>
                </h3>
                {facts.data && derived.length === 0 ? <p className="mt-2 text-[0.88rem] text-coal-3">No facts were extracted from it.</p> : null}
                <ul className="mt-3 space-y-1.5">
                  {derived.map((f) => (
                    <li key={f.id}>
                      <button
                        type="button"
                        onClick={() => openWhy(f.id)}
                        className="w-full rounded-[10px] border rule px-3 py-2 text-left hover:border-[rgb(14_14_16/0.25)]"
                      >
                        <span className="block text-[0.8rem] text-coal-3">
                          {f.subject}, {predicateLabel(f.predicate)}
                        </span>
                        <span className="mt-0.5 flex flex-wrap items-center justify-between gap-2">
                          <span className={`text-[0.94rem] font-semibold ${f.status === "active" ? "text-coal" : "mark-superseded"}`}>{fmtObject(f.object)}</span>
                          <StatusMark fact={f} />
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </aside>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
