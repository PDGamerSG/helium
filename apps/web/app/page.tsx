import Link from "next/link";

const signals = [
  ["12", "open commitments"],
  ["08", "decisions this week"],
  ["03", "threads need review"],
];

export default function Page() {
  return (
    <main className="helium-home">
      <nav className="topbar" aria-label="Primary navigation">
        <Link className="wordmark" href="/" aria-label="Helium home"><span className="wordmark-mark">H</span>helium</a>
        <div className="topbar-links"><a href="#memory">Memory</a><a href="#signals">Signals</a><button>Open workspace</button></div>
      </nav>
      <section className="hero" id="memory">
        <div className="hero-copy">
          <p className="eyebrow">TEAM MEMORY / 01</p>
          <h1>Keep the thread<br /><em>between</em> the moments.</h1>
          <p className="lede">Helium turns the conversations your team has into memory you can trace, search, and trust.</p>
          <div className="hero-actions"><a className="primary-action" href="#signals">Explore the signal <span>↗</span></a><span className="quiet-note">Neo4j-backed · evidence-first</span></div>
        </div>
        <div className="hero-orbit" aria-label="Helium memory graph illustration"><div className="orbit orbit-one" /><div className="orbit orbit-two" /><div className="core">He<small>2</small></div><span className="node node-one">decision</span><span className="node node-two">evidence</span><span className="node node-three">commitment</span></div>
      </section>
      <section className="signal-strip" id="signals">{signals.map(([value, label]) => <div className="signal" key={label}><strong>{value}</strong><span>{label}</span></div>)}<p>One place to see what changed, why it changed, and what comes next.</p></section>
    </main>
  );
}
