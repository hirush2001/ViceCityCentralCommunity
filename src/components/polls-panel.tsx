"use client";

import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Plus, Send, Sparkles, X } from "lucide-react";

type Poll = {
  id: string;
  created_by: string | null;
  question: string;
  description: string;
  status: "active" | "closed";
  created_at: string;
};

type PollOption = {
  id: string;
  poll_id: string;
  label: string;
  position: number;
};

type PollResult = {
  option_id: string;
  option_label: string;
  vote_count: number;
  total_votes: number;
};

type PollsPanelProps = {
  user: User | null;
  onRequireSignIn: () => void;
};

export default function PollsPanel({ user, onRequireSignIn }: PollsPanelProps) {
  const [polls, setPolls] = useState<Poll[]>([]);
  const [optionsByPoll, setOptionsByPoll] = useState<Record<string, PollOption[]>>({});
  const [resultsByPoll, setResultsByPoll] = useState<Record<string, PollResult[]>>({});
  const [myVotes, setMyVotes] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [description, setDescription] = useState("");
  const [optionDrafts, setOptionDrafts] = useState(["", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [closingPollId, setClosingPollId] = useState<string | null>(null);

  const refreshPolls = useCallback(async (silent = false) => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("Connect Supabase to enable community polls.");
      return;
    }

    if (!silent) setLoading(true);
    setError("");
    const supabase = createClient();
    const { data: pollData, error: pollError } = await supabase
      .from("polls")
      .select("id, created_by, question, description, status, created_at")
      .order("created_at", { ascending: false })
      .limit(6);

    if (pollError) {
      setError(pollError.message);
      setPolls([]);
      setLoading(false);
      return;
    }

    const pollRows = (pollData ?? []) as Poll[];
    const pollIds = pollRows.map((poll) => poll.id);
    setPolls(pollRows);

    if (pollIds.length === 0) {
      setOptionsByPoll({});
      setResultsByPoll({});
      setMyVotes({});
      setLoading(false);
      return;
    }

    const [optionResult, resultEntries] = await Promise.all([
      supabase
        .from("poll_options")
        .select("id, poll_id, label, position")
        .in("poll_id", pollIds)
        .order("position", { ascending: true }),
      Promise.all(pollRows.map(async (poll) => {
        const { data, error: resultError } = await supabase.rpc("get_poll_results", { p_poll_id: poll.id });
        return {
          pollId: poll.id,
          rows: (data ?? []) as PollResult[],
          error: resultError?.message ?? ""
        };
      }))
    ]);

    if (optionResult.error) {
      setError(optionResult.error.message);
      setLoading(false);
      return;
    }
    const failedResult = resultEntries.find((entry) => entry.error);
    if (failedResult) {
      setError(failedResult.error);
      setLoading(false);
      return;
    }

    let voteRows: Array<{ poll_id: string; option_id: string }> = [];
    if (user) {
      const { data: voteData, error: voteError } = await supabase
        .from("poll_votes")
        .select("poll_id, option_id")
        .eq("user_id", user.id)
        .in("poll_id", pollIds);
      if (voteError) {
        setError(voteError.message);
        setLoading(false);
        return;
      }
      voteRows = (voteData ?? []) as Array<{ poll_id: string; option_id: string }>;
    }

    const groupedOptions: Record<string, PollOption[]> = {};
    ((optionResult.data ?? []) as PollOption[]).forEach((option) => {
      groupedOptions[option.poll_id] = [...(groupedOptions[option.poll_id] ?? []), option];
    });
    const voteMap: Record<string, string> = {};
    voteRows.forEach((vote) => {
      voteMap[vote.poll_id] = vote.option_id;
    });
    const resultMap: Record<string, PollResult[]> = {};
    resultEntries.forEach(({ pollId, rows }) => { resultMap[pollId] = rows; });

    setOptionsByPoll(groupedOptions);
    setMyVotes(voteMap);
    setResultsByPoll(resultMap);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    void refreshPolls();
  }, [refreshPolls]);

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    const channel = supabase
      .channel("vice-city-central-poll-results")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "poll_options" },
        () => { void refreshPolls(true); }
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [refreshPolls]);

  async function castVote(poll: Poll, option: PollOption) {
    if (!user) {
      onRequireSignIn();
      return;
    }
    if (poll.status !== "active" || myVotes[poll.id] || votingPollId) return;

    setVotingPollId(poll.id);
    setError("");
    const supabase = createClient();
    const { error: voteError } = await supabase.from("poll_votes").insert({
      poll_id: poll.id,
      option_id: option.id,
      user_id: user.id
    });

    if (voteError) {
      setError(voteError.code === "23505" ? "You have already voted in this poll." : voteError.message);
    }
    await refreshPolls();
    setVotingPollId(null);
  }

  async function createPoll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) {
      onRequireSignIn();
      return;
    }

    const cleanOptions = optionDrafts.map((item) => item.trim()).filter(Boolean);
    const uniqueOptions = [...new Set(cleanOptions)];
    if (question.trim().length < 8) {
      setError("Your poll question must contain at least 8 characters.");
      return;
    }
    if (uniqueOptions.length < 2 || uniqueOptions.length !== cleanOptions.length) {
      setError("Add at least two different options. Remove blank or duplicate options.");
      return;
    }
    if (uniqueOptions.length > 6) {
      setError("A poll can have up to six options.");
      return;
    }

    setSubmitting(true);
    setError("");
    const supabase = createClient();
    const { data: poll, error: createError } = await supabase
      .from("polls")
      .insert({
        created_by: user.id,
        question: question.trim(),
        description: description.trim(),
        status: "active"
      })
      .select("id")
      .single();

    if (createError || !poll) {
      setError(createError?.message ?? "Could not create this poll.");
      setSubmitting(false);
      return;
    }

    const { error: optionsError } = await supabase.from("poll_options").insert(
      uniqueOptions.map((label, position) => ({ poll_id: poll.id, label, position }))
    );

    if (optionsError) {
      await supabase.from("polls").delete().eq("id", poll.id).eq("created_by", user.id);
      setError(optionsError.message);
      setSubmitting(false);
      return;
    }

    setQuestion("");
    setDescription("");
    setOptionDrafts(["", ""]);
    setCreateOpen(false);
    setSubmitting(false);
    await refreshPolls();
  }

  async function closePoll(poll: Poll) {
    if (!user || poll.created_by !== user.id || poll.status !== "active") return;
    setClosingPollId(poll.id);
    const { error: closeError } = await createClient()
      .from("polls")
      .update({ status: "closed" })
      .eq("id", poll.id)
      .eq("created_by", user.id);
    if (closeError) setError(closeError.message);
    await refreshPolls();
    setClosingPollId(null);
  }

  return (
    <div className="side-card pulse-card polls-panel" id="pulse">
      <div className="side-card-heading">
        <span className="side-icon pink-icon"><Sparkles size={15} /></span>
        <span>COMMUNITY PULSE</span>
        <span className="live-label">REAL POLLS</span>
      </div>

      <div className="polls-panel-toolbar">
        <p className="poll-description">Vote in community polls or create one for other members.</p>
        <button className="poll-create-trigger" type="button" onClick={() => user ? setCreateOpen((open) => !open) : onRequireSignIn()}>
          <Plus size={13} /> Create poll
        </button>
      </div>

      {error && <div className="poll-error" role="alert">{error}</div>}
      {loading && <div className="polls-empty">Loading community polls...</div>}
      {!loading && polls.length === 0 && <div className="polls-empty">No polls yet. Be the first to create one.</div>}

      <div className="polls-list">
        {polls.map((poll) => {
          const options = optionsByPoll[poll.id] ?? [];
          const results = resultsByPoll[poll.id] ?? [];
          const selectedOptionId = myVotes[poll.id];
          const totalVotes = results[0]?.total_votes ?? 0;
          const canManage = Boolean(user && poll.created_by === user.id && poll.status === "active");
          return (
            <article className="poll-card" key={poll.id}>
              <div className="poll-card-meta">
                <span>{poll.status === "active" ? "OPEN POLL" : "CLOSED POLL"}</span>
                <span>{totalVotes} {totalVotes === 1 ? "VOTE" : "VOTES"}</span>
              </div>
              <h3>{poll.question}</h3>
              {poll.description && <p className="poll-description">{poll.description}</p>}
              <div className="poll-options">
                {options.map((option) => {
                  const result = results.find((item) => item.option_id === option.id);
                  const count = result?.vote_count ?? 0;
                  const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                  const selected = selectedOptionId === option.id;
                  const canVote = poll.status === "active" && !selectedOptionId;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      className={`poll-option ${selected ? "poll-selected" : ""}`}
                      onClick={() => void castVote(poll, option)}
                      disabled={!canVote || votingPollId === poll.id}
                      aria-pressed={selected}
                    >
                      {(selectedOptionId || poll.status === "closed") && <span className="poll-bar" style={{ width: `${percent}%` }} />}
                      <span className="poll-option-label">{option.label}</span>
                      {(selectedOptionId || poll.status === "closed") && <strong>{percent}%</strong>}
                      {selected && <span className="your-vote">YOUR VOTE</span>}
                    </button>
                  );
                })}
              </div>
              <div className="poll-footer">
                <span>{poll.status === "closed" ? "Voting has ended" : selectedOptionId ? "Thanks for voting" : user ? "Choose one option to vote" : "Sign in to cast your vote"}</span>
                {canManage ? (
                  <button className="poll-close-button" type="button" onClick={() => void closePoll(poll)} disabled={closingPollId === poll.id}>Close poll</button>
                ) : <span>{selectedOptionId || poll.status === "closed" ? "LIVE RESULTS" : "ONE VOTE EACH"}</span>}
              </div>
            </article>
          );
        })}
      </div>

      {createOpen && (
        <form className="poll-create-form" onSubmit={(event) => void createPoll(event)}>
          <div className="poll-create-heading"><strong>CREATE A COMMUNITY POLL</strong><button type="button" onClick={() => setCreateOpen(false)} aria-label="Close poll form"><X size={14} /></button></div>
          <label>QUESTION<input value={question} onChange={(event) => setQuestion(event.target.value)} maxLength={140} minLength={8} placeholder="What should the community decide?" required /></label>
          <label>DESCRIPTION <span>(OPTIONAL)</span><input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={300} placeholder="Add a little context..." /></label>
          <div className="poll-option-editor-label">ANSWER OPTIONS <span>2–6 OPTIONS</span></div>
          {optionDrafts.map((option, index) => (
            <div className="poll-option-editor-row" key={index}>
              <input value={option} onChange={(event) => setOptionDrafts((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))} maxLength={70} placeholder={`Option ${index + 1}`} />
              {optionDrafts.length > 2 && <button type="button" onClick={() => setOptionDrafts((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove option ${index + 1}`}><X size={13} /></button>}
            </div>
          ))}
          {optionDrafts.length < 6 && <button className="poll-add-option" type="button" onClick={() => setOptionDrafts((current) => [...current, ""])}><Plus size={12} /> Add option</button>}
          <button className="button button-primary poll-submit-button" type="submit" disabled={submitting}>{submitting ? "Creating..." : "Publish poll"} <Send size={13} /></button>
        </form>
      )}

      {!user && <div className="polls-signin-note">Members can vote once per poll. <button type="button" onClick={onRequireSignIn}>Sign in</button> to participate.</div>}
      <div className="poll-footer polls-panel-footer"><span>ONE VOTE PER MEMBER</span><span>COMMUNITY POWERED</span></div>
    </div>
  );
}
