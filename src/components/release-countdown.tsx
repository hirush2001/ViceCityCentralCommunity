
"use client";

import { useEffect, useState } from "react";

type Countdown = {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  launched: boolean;
};

function getCountdown(): Countdown {
  // November 19, 2026 at midnight in the visitor's local timezone.
  const target = new Date(2026, 10, 19, 0, 0, 0).getTime();
  const difference = target - Date.now();

  if (difference <= 0) {
    return {
      days: 0,
      hours: 0,
      minutes: 0,
      seconds: 0,
      launched: true
    };
  }

  return {
    days: Math.floor(difference / 86400000),
    hours: Math.floor((difference % 86400000) / 3600000),
    minutes: Math.floor((difference % 3600000) / 60000),
    seconds: Math.floor((difference % 60000) / 1000),
    launched: false
  };
}

export default function ReleaseCountdown() {
  const [time, setTime] = useState<Countdown | null>(null);

  useEffect(() => {
    const update = () => setTime(getCountdown());

    update();

    const interval = window.setInterval(update, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <section className="release-countdown">
      <div className="release-countdown-inner">

        <span className="release-countdown-kicker">
          THE COUNTDOWN HAS BEGUN
        </span>

        <h2>
          GRAND THEFT AUTO VI
          <em> IS ALMOST HERE.</em>
        </h2>

        <p className="release-countdown-description">
          The streets of Leonida are waiting.
          Are you ready to return to Vice City?
        </p>

        {!time ? (
          <p>Preparing countdown...</p>
        ) : time.launched ? (
          <div className="release-launched">
            THE WAIT IS OVER. GTA VI IS HERE!
          </div>
        ) : (
          <div className="release-countdown-grid" role="timer">
            {[
              { label: "DAYS", value: time.days },
              { label: "HOURS", value: time.hours },
              { label: "MINUTES", value: time.minutes },
              { label: "SECONDS", value: time.seconds }
            ].map((item) => (
              <div className="release-countdown-card" key={item.label}>
                <strong>
                  {String(item.value).padStart(2, "0")}
                </strong>
                <span>{item.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="release-countdown-date">
          OFFICIAL RELEASE · NOVEMBER 19, 2026
        </div>

      </div>
    </section>
  );
}
