// Scoreyard — Tweaks panel (host-protocol wired via tweaks-panel.jsx)
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "duration": 75,
  "spawnRate": 1,
  "particles": 1,
  "shake": 1
}/*EDITMODE-END*/;

function ScoreyardTweaks() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    window.SY = window.SY || {};
    window.SY.tweaks = window.SY.tweaks || {};
    Object.assign(window.SY.tweaks, {
      duration: t.duration,
      spawnRate: t.spawnRate,
      particles: t.particles,
      shake: t.shake,
    });
  }, [t]);

  return (
    <TweaksPanel>
      <TweakSection label="Run" />
      <TweakSlider label="Game time" value={t.duration} min={60} max={120} step={5} unit="s"
                   onChange={(v) => setTweak('duration', v)} />
      <TweakSlider label="Enemy spawn rate" value={t.spawnRate} min={0.4} max={2.5} step={0.1} unit="×"
                   onChange={(v) => setTweak('spawnRate', v)} />
      <TweakSection label="Feel" />
      <TweakSlider label="Particle intensity" value={t.particles} min={0} max={2} step={0.1} unit="×"
                   onChange={(v) => setTweak('particles', v)} />
      <TweakSlider label="Screen shake" value={t.shake} min={0} max={2} step={0.1} unit="×"
                   onChange={(v) => setTweak('shake', v)} />
    </TweaksPanel>
  );
}

ReactDOM.createRoot(document.getElementById('tweaks-root')).render(<ScoreyardTweaks />);
