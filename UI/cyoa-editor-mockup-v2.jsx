import { useState, useRef, useEffect } from "react";

/* ──────────────────────────── Design tokens ──────────────────────────── */

const NODE_COLOURS = {
  start:             { border: "#2563eb", bg: "#eff6ff", badge: "#2563eb", text: "#1e40af" },
  scene_start:       { border: "#7c3aed", bg: "#f5f3ff", badge: "#7c3aed", text: "#5b21b6" },
  decision:          { border: "#ea580c", bg: "#fff7ed", badge: "#ea580c", text: "#c2410c" },
  narrative:         { border: "#475569", bg: "#f8fafc", badge: "#475569", text: "#334155" },
  combat:            { border: "#d97706", bg: "#fffbeb", badge: "#d97706", text: "#b45309" },
  puzzle:            { border: "#0d9488", bg: "#f0fdfa", badge: "#0d9488", text: "#0f766e" },
  end:               { border: "#dc2626", bg: "#fef2f2", badge: "#dc2626", text: "#b91c1c" },
  adventure_success: { border: "#16a34a", bg: "#f0fdf4", badge: "#16a34a", text: "#15803d" },
};

const CLASSIFIER_BADGES = {
  orphan:      { label: "Orphan",      bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
  unreachable: { label: "Unreachable", bg: "#fef2f2", fg: "#991b1b", border: "#fecaca" },
  junction:    { label: "Junction",    bg: "#ede9fe", fg: "#5b21b6", border: "#c4b5fd" },
  branch:      { label: "Branch",      bg: "#dbeafe", fg: "#1e40af", border: "#93c5fd" },
  linear_link: { label: "Linear",      bg: "#f1f5f9", fg: "#475569", border: "#cbd5e1" },
  checkpoint:  { label: "Checkpoint",  bg: "#fef3c7", fg: "#b45309", border: "#fde68a" },
};

/* ──────────────────────────── Sample data ──────────────────────────── */

const SAMPLE_NODES = [
  {
    id: "a1b2c3d4-0001",
    title: "A Misty Morning Approach",
    node_type: "start",
    narrativeText: "The narrow path winds through thick morning mist. Ahead, the dark outline of the castle looms against a grey sky. Your boots crunch on loose gravel as the air grows colder with every step.",
    entry_foley: "footsteps_gravel",
    music: "mysterious_calm",
    sounds: "mist_wind_ambience",
    checkpoint: false,
    activities: ["Area introduced"],
    // classifier tags (computed, never stored)
    _tags: { isBranch: true, depth: 0 },
    choices: [
      { choiceText: "Approach the main gate", choiceResponseConstraint: "one", nextNode: "a1b2c3d4-0002" },
      { choiceText: "Circle around to find another entrance", choiceResponseConstraint: "two", nextNode: "a1b2c3d4-0003" },
    ],
  },
  {
    id: "a1b2c3d4-0002",
    title: "The Iron Gate",
    node_type: "decision",
    narrativeText: "A massive iron gate bars your path, rusted but still formidable. Through the bars you can see a courtyard beyond, overgrown with weeds.",
    entry_foley: "gate_creak",
    music: "mysterious_calm",
    sounds: "wind_howl",
    checkpoint: true,
    activities: [],
    _tags: { isJunction: true, depth: 1 },
    choices: [
      { choiceText: "Try to force the gate open", choiceResponseConstraint: "one", nextNode: "a1b2c3d4-0004" },
      { choiceText: "Search for a key nearby", choiceResponseConstraint: "two", nextNode: "a1b2c3d4-0005" },
      { choiceText: "Call out to see if anyone is inside", choiceResponseConstraint: "three", nextNode: "a1b2c3d4-0006" },
    ],
  },
  {
    id: "a1b2c3d4-0003",
    title: "The Overgrown Path",
    node_type: "narrative",
    narrativeText: "You push through brambles and nettles, the castle wall rough stone against your left hand.",
    entry_foley: "bramble_rustle",
    music: "mysterious_calm",
    sounds: "birds_rustling",
    checkpoint: false,
    activities: [],
    _tags: { isLinearLink: true, depth: 1 },
    choices: [
      { choiceText: "Continue along the wall", choiceResponseConstraint: "one", nextNode: "a1b2c3d4-0007" },
    ],
  },
  {
    id: "a1b2c3d4-0007",
    title: "The Collapsed Tower",
    node_type: "end",
    narrativeText: "The path ends abruptly at a collapsed tower. Rubble blocks your way entirely. There is no way forward.",
    entry_foley: "rubble_crumble",
    music: "none",
    sounds: "wind_howl",
    checkpoint: false,
    activities: [],
    _tags: { isTerminal: true, depth: 2 },
    choices: [],
  },
];

const KNOWN_ASSETS = [
  "footsteps_gravel", "gate_creak", "bramble_rustle", "rubble_crumble",
  "mysterious_calm", "battle_drums", "victory_fanfare",
  "mist_wind_ambience", "wind_howl", "birds_rustling", "dripping_water",
];

const ISSUES = [
  { type: "warning", node: "a1b2c3d4-0007", message: "Unreachable node — no inbound choices reference this node except from a1b2c3d4-0003" },
];

/* ──────────────────────────── Shared components ──────────────────────────── */

function TypeBadge({ type }) {
  const c = NODE_COLOURS[type] || NODE_COLOURS.narrative;
  return (
    <span style={{
      display: "inline-block", fontSize: "11px", fontWeight: 600,
      letterSpacing: "0.04em", textTransform: "uppercase",
      color: "#fff", background: c.badge, borderRadius: "4px",
      padding: "2px 8px", lineHeight: "18px",
    }}>{type.replace(/_/g, " ")}</span>
  );
}

function ClassifierTag({ tag }) {
  const cfg = CLASSIFIER_BADGES[tag];
  if (!cfg) return null;
  return (
    <span style={{
      display: "inline-block", fontSize: "10px", fontWeight: 600,
      letterSpacing: "0.03em", textTransform: "uppercase",
      color: cfg.fg, background: cfg.bg, border: `1px solid ${cfg.border}`,
      borderRadius: "4px", padding: "1px 6px", lineHeight: "16px",
    }}>{cfg.label}</span>
  );
}

function CheckpointIndicator() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      fontSize: "11px", fontWeight: 600, color: "#b45309",
      background: "#fef3c7", borderRadius: "4px",
      padding: "2px 8px", lineHeight: "18px",
    }}>
      <span style={{ width: 4, height: 14, background: "#d97706", borderRadius: 2 }} />
      Checkpoint
    </span>
  );
}

/* ──────────────────────────── Form primitives ──────────────────────────── */

function FieldGroup({ title, icon, children, defaultOpen = true }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ marginBottom: 2 }}>
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "none", border: "none", cursor: "pointer",
          padding: "8px 0", fontSize: "12px", fontWeight: 600,
          color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em",
        }}
      >
        <span style={{
          fontSize: 10, transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)",
        }}>▶</span>
        <span aria-hidden="true">{icon}</span>
        <span>{title}</span>
      </button>
      {open && <div style={{ paddingLeft: 4, paddingBottom: 8 }}>{children}</div>}
    </div>
  );
}

function Field({ label, value, type = "text", large = false, disabled = false }) {
  const isTextarea = large || (value && value.length > 80);
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", fontSize: "12px", fontWeight: 500,
        color: "#64748b", marginBottom: 4,
      }}>{label}</label>
      {isTextarea ? (
        <textarea
          defaultValue={value}
          disabled={disabled}
          rows={3}
          style={{
            width: "100%", padding: "8px 10px", fontSize: "13.5px",
            border: "1px solid #e2e8f0", borderRadius: 6,
            background: disabled ? "#f1f5f9" : "#fff", color: disabled ? "#94a3b8" : "#1e293b",
            resize: "vertical", lineHeight: 1.5,
            fontFamily: "'Source Serif 4', Georgia, serif",
            boxSizing: "border-box",
          }}
        />
      ) : (
        <input
          type={type}
          defaultValue={value}
          disabled={disabled}
          style={{
            width: "100%", padding: "7px 10px", fontSize: "13.5px",
            border: "1px solid #e2e8f0", borderRadius: 6,
            background: disabled ? "#f1f5f9" : "#fff", color: disabled ? "#94a3b8" : "#1e293b",
            boxSizing: "border-box",
          }}
        />
      )}
    </div>
  );
}

function SelectField({ label, value, options }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <label style={{
        display: "block", fontSize: "12px", fontWeight: 500,
        color: "#64748b", marginBottom: 4,
      }}>{label}</label>
      <select
        defaultValue={value}
        style={{
          width: "100%", padding: "7px 10px", fontSize: "13.5px",
          border: "1px solid #e2e8f0", borderRadius: 6,
          background: "#fff", color: "#1e293b",
        }}
      >
        {options.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
      </select>
    </div>
  );
}

/** Editable combobox — type freely or pick from suggestions */
function ComboField({ label, value, suggestions = [], placeholder = "" }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || "");
  const ref = useRef(null);

  const filtered = suggestions.filter(
    s => s.toLowerCase().includes(query.toLowerCase()) && s !== query
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ marginBottom: 12, position: "relative" }} ref={ref}>
      <label style={{
        display: "block", fontSize: "12px", fontWeight: 500,
        color: "#64748b", marginBottom: 4,
      }}>{label}</label>
      <div style={{ position: "relative" }}>
        <input
          role="combobox"
          aria-expanded={open && filtered.length > 0}
          aria-autocomplete="list"
          value={query}
          placeholder={placeholder}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{
            width: "100%", padding: "7px 28px 7px 10px", fontSize: "13.5px",
            border: "1px solid #e2e8f0", borderRadius: 6,
            background: "#fff", color: "#1e293b", boxSizing: "border-box",
          }}
        />
        <span
          onClick={() => setOpen(!open)}
          style={{
            position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
            fontSize: 10, color: "#94a3b8", cursor: "pointer", userSelect: "none",
          }}
          aria-hidden="true"
        >▼</span>
      </div>
      {open && filtered.length > 0 && (
        <ul role="listbox" style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 160,
          overflowY: "auto", margin: "4px 0 0", padding: 0, listStyle: "none",
        }}>
          {filtered.map(s => (
            <li
              key={s}
              role="option"
              onClick={() => { setQuery(s); setOpen(false); }}
              style={{
                padding: "6px 10px", fontSize: "13px", cursor: "pointer",
                color: "#1e293b", fontFamily: "monospace",
              }}
              onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}
            >{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Node title combobox for nextNode selection */
function NodeCombo({ value, allNodes, onCreateNew }) {
  const [open, setOpen] = useState(false);
  const targetNode = allNodes.find(n => n.id === value);
  const [query, setQuery] = useState(targetNode ? targetNode.title : value || "");
  const ref = useRef(null);

  const filtered = allNodes.filter(
    n => n.title.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div style={{ flex: 1, position: "relative" }} ref={ref}>
      <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: 3 }}>
        Next node
      </label>
      <input
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label="Select target node by title"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Search nodes by title…"
        style={{
          width: "100%", padding: "5px 8px", fontSize: "12px",
          border: "1px solid #e2e8f0", borderRadius: 5,
          background: "#fff", color: "#1e293b", boxSizing: "border-box",
          fontWeight: 500,
        }}
      />
      {open && (
        <ul role="listbox" style={{
          position: "absolute", top: "100%", left: 0, right: 0, zIndex: 20,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6,
          boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 180,
          overflowY: "auto", margin: "4px 0 0", padding: 0, listStyle: "none",
        }}>
          {filtered.map(n => {
            const nc = NODE_COLOURS[n.node_type] || NODE_COLOURS.narrative;
            return (
              <li
                key={n.id}
                role="option"
                onClick={() => { setQuery(n.title); setOpen(false); }}
                style={{
                  padding: "6px 10px", fontSize: "12px", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6, color: "#1e293b",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "#f1f5f9"}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: 2,
                  background: nc.badge, flexShrink: 0,
                }} />
                <span style={{ fontWeight: 500 }}>{n.title}</span>
                <span style={{
                  fontSize: "10px", color: "#94a3b8", marginLeft: "auto",
                  textTransform: "uppercase",
                }}>{n.node_type.replace(/_/g, " ")}</span>
              </li>
            );
          })}
          {/* Create new node option */}
          <li
            role="option"
            onClick={onCreateNew}
            style={{
              padding: "8px 10px", fontSize: "12px", cursor: "pointer",
              display: "flex", alignItems: "center", gap: 6,
              color: "#2563eb", fontWeight: 600,
              borderTop: "1px solid #e2e8f0",
            }}
            onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <span style={{ fontSize: 14 }}>＋</span>
            <span>Create new node…</span>
          </li>
        </ul>
      )}
    </div>
  );
}

/* ──────────────────────────── Choice card ──────────────────────────── */

function ChoiceCard({ choice, index, allNodes }) {
  return (
    <div style={{
      background: "#f8fafc", border: "1px solid #e2e8f0",
      borderRadius: 8, padding: "12px 14px", marginBottom: 8,
      position: "relative",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <span style={{
          fontSize: "11px", fontWeight: 600, color: "#94a3b8",
          textTransform: "uppercase", letterSpacing: "0.05em",
        }}>Choice {index + 1}</span>
        <button
          aria-label={`Delete choice ${index + 1}`}
          style={{
            background: "none", border: "none", cursor: "pointer",
            color: "#94a3b8", fontSize: "14px", padding: "0 4px", lineHeight: 1,
          }}
          title="Delete choice"
        >✕</button>
      </div>
      <div style={{ marginBottom: 8 }}>
        <input
          defaultValue={choice.choiceText}
          aria-label={`Choice ${index + 1} text`}
          style={{
            width: "100%", padding: "6px 8px", fontSize: "13.5px",
            border: "1px solid #e2e8f0", borderRadius: 5,
            background: "#fff", color: "#1e293b", boxSizing: "border-box",
            fontWeight: 500,
          }}
        />
      </div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ flex: "0 0 120px" }}>
          <label style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginBottom: 3 }}>
            Constraint
          </label>
          <input
            defaultValue={choice.choiceResponseConstraint}
            style={{
              width: "100%", padding: "5px 8px", fontSize: "12px",
              border: "1px solid #e2e8f0", borderRadius: 5,
              background: "#fff", color: "#64748b", boxSizing: "border-box",
            }}
          />
        </div>
        <NodeCombo
          value={choice.nextNode}
          allNodes={allNodes}
          onCreateNew={() => alert("Create new node dialog would open here")}
        />
      </div>
    </div>
  );
}

/* ──────────────────────────── Node card ──────────────────────────── */

function NodeCard({ node, allNodes }) {
  const [open, setOpen] = useState(node.node_type === "start");
  const c = NODE_COLOURS[node.node_type] || NODE_COLOURS.narrative;
  const isTerminal = node.node_type === "end" || node.node_type === "adventure_success";

  // Derive visible classifier tags
  const tags = [];
  if (node._tags?.isOrphan)     tags.push("orphan");
  if (node._tags?.unreachable)  tags.push("unreachable");
  if (node._tags?.isJunction)   tags.push("junction");
  if (node._tags?.isBranch)     tags.push("branch");
  if (node._tags?.isLinearLink) tags.push("linear_link");
  if (node.checkpoint)          tags.push("checkpoint");

  return (
    <div style={{
      background: "#fff", border: "1px solid #e2e8f0",
      borderLeft: `4px solid ${c.border}`, borderRadius: 10,
      marginBottom: 10, overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      transition: "box-shadow 0.15s",
    }}>
      {/* Collapsed header */}
      <button
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={`${node.title} — ${node.node_type.replace(/_/g, " ")} node`}
        style={{
          display: "flex", alignItems: "center", gap: 10,
          width: "100%", padding: "12px 16px",
          background: open ? c.bg : "transparent",
          border: "none", cursor: "pointer", textAlign: "left",
          transition: "background 0.15s",
        }}
      >
        <span style={{
          fontSize: 10, color: c.text, transition: "transform 0.15s",
          transform: open ? "rotate(90deg)" : "rotate(0deg)", flexShrink: 0,
        }} aria-hidden="true">▶</span>
        <span style={{
          flex: 1, fontSize: "14.5px", fontWeight: 600, color: "#1e293b",
          fontFamily: "'Source Serif 4', Georgia, serif",
        }}>{node.title}</span>
        <div style={{ display: "flex", gap: 5, alignItems: "center", flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
          {tags.map(t => <ClassifierTag key={t} tag={t} />)}
          <TypeBadge type={node.node_type} />
          {!isTerminal && (
            <span style={{
              fontSize: "11px", color: "#94a3b8", fontWeight: 500, whiteSpace: "nowrap",
            }}>{node.choices.length} choice{node.choices.length !== 1 ? "s" : ""}</span>
          )}
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div style={{ padding: "4px 16px 16px 20px" }}>

          {/* ── Narrative ── */}
          <FieldGroup title="Narrative" icon="📝" defaultOpen={true}>
            <Field label="Node ID" value={node.id} disabled={true} />
            <Field label="Title" value={node.title} />
            <SelectField
              label="Node type"
              value={node.node_type}
              options={["start", "decision", "scene_start", "end", "adventure_success", "narrative", "combat", "puzzle"]}
            />
            <div style={{ position: "relative" }}>
              <Field label="Narrative text" value={node.narrativeText} large={true} />
              {/* TTS placeholder */}
              <button
                disabled
                title="Text-to-speech preview (coming soon)"
                aria-label="Preview narrative with text-to-speech — coming soon"
                style={{
                  position: "absolute", top: 0, right: 0,
                  background: "#f1f5f9", border: "1px solid #e2e8f0",
                  borderRadius: 5, padding: "3px 8px", fontSize: "11px",
                  color: "#cbd5e1", cursor: "not-allowed", fontWeight: 600,
                  display: "flex", alignItems: "center", gap: 4,
                }}
              >
                <span aria-hidden="true">🔊</span> TTS
              </button>
            </div>
          </FieldGroup>

          {/* ── Audio ── */}
          <FieldGroup title="Audio" icon="🔊" defaultOpen={false}>
            <ComboField label="Entry foley" value={node.entry_foley} suggestions={KNOWN_ASSETS} placeholder="Type or select asset…" />
            <ComboField label="Music" value={node.music} suggestions={KNOWN_ASSETS} placeholder="Type or select asset…" />
            <ComboField label="Ambient sounds" value={node.sounds} suggestions={KNOWN_ASSETS} placeholder="Type or select asset…" />
          </FieldGroup>

          {/* ── Gameplay ── */}
          <FieldGroup title="Gameplay" icon="🎮" defaultOpen={false}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                <input type="checkbox" defaultChecked={node.checkpoint} style={{ width: 16, height: 16, accentColor: "#d97706" }} />
                <span style={{ fontSize: "13.5px", color: "#1e293b", fontWeight: 500 }}>Checkpoint</span>
              </label>
              <span style={{ display: "block", fontSize: "11px", color: "#94a3b8", marginTop: 3, marginLeft: 24 }}>
                Player progress is saved at this node
              </span>
            </div>
            {/* Activities — always visible */}
            <div>
              <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "#64748b", marginBottom: 6 }}>Activities</label>
              {node.activities.length > 0 ? (
                node.activities.map((a, i) => (
                  <div key={i} style={{
                    display: "flex", gap: 8, alignItems: "center", marginBottom: 6,
                  }}>
                    <span style={{ fontSize: "11px", color: "#94a3b8", width: 16, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
                    <input
                      defaultValue={a}
                      aria-label={`Activity ${i + 1}`}
                      style={{
                        flex: 1, padding: "5px 8px", fontSize: "13px",
                        border: "1px solid #e2e8f0", borderRadius: 5,
                        background: "#fff", color: "#1e293b",
                      }}
                    />
                    <button
                      aria-label={`Remove activity ${i + 1}`}
                      style={{
                        background: "none", border: "none", cursor: "pointer",
                        color: "#94a3b8", fontSize: "12px",
                      }}
                    >✕</button>
                  </div>
                ))
              ) : (
                <p style={{ fontSize: "12px", color: "#cbd5e1", margin: "0 0 6px", fontStyle: "italic" }}>
                  No activities yet
                </p>
              )}
              <button style={{
                background: "none", border: "1px dashed #cbd5e1",
                borderRadius: 5, padding: "4px 12px", fontSize: "12px",
                color: "#94a3b8", cursor: "pointer", marginTop: 2,
              }}>+ Add activity</button>
            </div>
          </FieldGroup>

          {/* ── Choices ── */}
          {!isTerminal && (
            <FieldGroup title={`Choices (${node.choices.length})`} icon="🔀" defaultOpen={true}>
              {node.choices.map((ch, i) => (
                <ChoiceCard key={i} choice={ch} index={i} allNodes={allNodes} />
              ))}
              <button style={{
                width: "100%", padding: "10px",
                background: "none", border: "2px dashed #cbd5e1",
                borderRadius: 8, fontSize: "13px", color: "#94a3b8",
                cursor: "pointer", transition: "border-color 0.15s, color 0.15s",
              }}>+ Add choice</button>
            </FieldGroup>
          )}

          {isTerminal && (
            <div style={{
              padding: "10px 14px", background: "#fef2f2",
              borderRadius: 6, fontSize: "12px", color: "#991b1b",
              border: "1px solid #fecaca",
            }}>
              Terminal node — choices are not permitted on {node.node_type.replace(/_/g, " ")} nodes
            </div>
          )}

          {/* ── Footer: ID + delete ── */}
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            marginTop: 12, paddingTop: 12, borderTop: "1px solid #f1f5f9",
          }}>
            <button
              aria-label={`Delete node: ${node.title}`}
              style={{
                padding: "5px 12px", fontSize: "12px", fontWeight: 600,
                background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca",
                borderRadius: 5, cursor: "pointer",
              }}
            >Delete node</button>
            <span style={{ fontSize: "11px", color: "#cbd5e1", fontFamily: "monospace" }}>
              {node.id}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────── Sidebar panels ──────────────────────────── */

function IssuesBar({ issues }) {
  const hasIssues = issues.length > 0;
  return (
    <div style={{
      background: hasIssues ? "#fffbeb" : "#f0fdf4",
      border: `1px solid ${hasIssues ? "#fde68a" : "#bbf7d0"}`,
      borderRadius: 10, padding: "12px 16px", marginBottom: 16,
    }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        fontSize: "12px", fontWeight: 600,
        color: hasIssues ? "#92400e" : "#166534",
        textTransform: "uppercase", letterSpacing: "0.04em",
      }}>
        <span aria-hidden="true">{hasIssues ? "⚠" : "✓"}</span>
        <span>{hasIssues ? `${issues.length} issue${issues.length !== 1 ? "s" : ""} found` : "No issues"}</span>
      </div>
      {hasIssues && (
        <div style={{ marginTop: 8 }} role="list" aria-label="Validation issues">
          {issues.map((issue, i) => (
            <div key={i} role="listitem" style={{
              display: "flex", gap: 8, fontSize: "12.5px", color: "#78350f",
              padding: "4px 0", alignItems: "baseline",
            }}>
              <span style={{ color: "#d97706", flexShrink: 0 }} aria-hidden="true">•</span>
              <span>{issue.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AssetSummary({ nodes }) {
  const assets = new Set();
  nodes.forEach(n => {
    if (n.entry_foley && n.entry_foley !== "none") assets.add(n.entry_foley);
    if (n.music && n.music !== "none") assets.add(n.music);
    if (n.sounds && n.sounds !== "none") assets.add(n.sounds);
  });
  return (
    <div style={{
      background: "#f8fafc", border: "1px solid #e2e8f0",
      borderRadius: 10, padding: "12px 16px", marginBottom: 16,
    }}>
      <div style={{
        fontSize: "12px", fontWeight: 600, color: "#64748b",
        textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8,
      }}>Asset manifest ({assets.size})</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
        {[...assets].map(a => (
          <span key={a} style={{
            fontSize: "11.5px", padding: "3px 10px",
            background: "#e2e8f0", borderRadius: 20,
            color: "#475569", fontFamily: "monospace",
          }}>{a}</span>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── Main layout ──────────────────────────── */

export default function CYOAEditorMockup() {
  const [mode, setMode] = useState("outline");

  return (
    <div style={{
      minHeight: "100vh", background: "#f1f5f9",
      fontFamily: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Source+Serif+4:wght@400;600&display=swap" rel="stylesheet" />

      {/* ── Header ── */}
      <header style={{
        background: "#fff", borderBottom: "1px solid #e2e8f0",
        padding: "0 24px", display: "flex", alignItems: "center",
        height: 56, gap: 16, position: "sticky", top: 0, zIndex: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
      }}>
        <h1 style={{
          fontSize: "16px", fontWeight: 700, color: "#1e293b",
          margin: 0, fontFamily: "'DM Sans', sans-serif",
          letterSpacing: "-0.01em",
        }}>
          <span style={{ color: "#2563eb" }}>Nova Sonus</span>
          <span style={{ color: "#cbd5e1", margin: "0 8px", fontWeight: 400 }}>—</span>
          CYOA Editor
        </h1>

        {/* Mode tabs */}
        <div role="tablist" aria-label="View mode" style={{
          display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 3, gap: 2,
        }}>
          {["outline", "canvas"].map(m => (
            <button
              key={m}
              role="tab"
              aria-selected={mode === m}
              onClick={() => setMode(m)}
              style={{
                padding: "6px 16px", fontSize: "13px", fontWeight: 600,
                border: "none", borderRadius: 6, cursor: "pointer",
                background: mode === m ? "#fff" : "transparent",
                color: mode === m ? "#1e293b" : "#94a3b8",
                boxShadow: mode === m ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                transition: "all 0.15s", textTransform: "capitalize",
              }}
            >{m}</button>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        <button style={{
          padding: "7px 16px", fontSize: "13px", fontWeight: 600,
          background: "#2563eb", color: "#fff", border: "none",
          borderRadius: 7, cursor: "pointer",
        }}>New adventure</button>

        <button style={{
          padding: "7px 16px", fontSize: "13px", fontWeight: 600,
          background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
          borderRadius: 7, cursor: "pointer",
        }}>Open</button>

        <button style={{
          padding: "7px 16px", fontSize: "13px", fontWeight: 600,
          background: "#f8fafc", color: "#64748b", border: "1px solid #e2e8f0",
          borderRadius: 7, cursor: "pointer",
        }}>Save</button>
      </header>

      {/* ── Legend ── */}
      <div style={{
        padding: "10px 24px", background: "#fff",
        borderBottom: "1px solid #f1f5f9",
        display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center",
      }}>
        {Object.entries(NODE_COLOURS).map(([type, c]) => (
          <div key={type} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3,
              background: c.badge, display: "inline-block",
            }} />
            <span style={{
              fontSize: "11px", color: "#64748b", textTransform: "capitalize",
            }}>{type.replace(/_/g, " ")}</span>
          </div>
        ))}
        <span style={{ width: 1, height: 14, background: "#e2e8f0", display: "inline-block" }} />
        {Object.entries(CLASSIFIER_BADGES).map(([tag, cfg]) => (
          <div key={tag} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 3,
              background: cfg.bg, border: `1.5px solid ${cfg.border}`,
              display: "inline-block", boxSizing: "border-box",
            }} />
            <span style={{ fontSize: "11px", color: "#64748b" }}>{cfg.label}</span>
          </div>
        ))}
      </div>

      {/* ── Main content ── */}
      <div style={{
        display: "flex", maxWidth: 1200, margin: "0 auto",
        padding: "20px 24px", gap: 20,
      }}>
        {/* Node list */}
        <main style={{ flex: 1, minWidth: 0 }} aria-label="Node list">
          {/* Stats bar */}
          <div style={{
            display: "flex", gap: 16, marginBottom: 16,
            fontSize: "12px", color: "#94a3b8",
          }}>
            <span><strong style={{ color: "#1e293b" }}>{SAMPLE_NODES.length}</strong> nodes</span>
            <span><strong style={{ color: "#1e293b" }}>{SAMPLE_NODES.reduce((s, n) => s + n.choices.length, 0)}</strong> choices</span>
            <span><strong style={{ color: "#1e293b" }}>{SAMPLE_NODES.filter(n => n.checkpoint).length}</strong> checkpoints</span>
            <span><strong style={{ color: "#1e293b" }}>{SAMPLE_NODES.filter(n => n.node_type === "end" || n.node_type === "adventure_success").length}</strong> terminals</span>
          </div>

          {SAMPLE_NODES.map(node => (
            <NodeCard key={node.id} node={node} allNodes={SAMPLE_NODES} />
          ))}
        </main>

        {/* Sidebar */}
        <aside style={{ width: 280, flexShrink: 0 }} aria-label="Adventure summary">
          <div style={{ position: "sticky", top: 76 }}>
            <IssuesBar issues={ISSUES} />
            <AssetSummary nodes={SAMPLE_NODES} />

            {/* Quick nav */}
            <nav style={{
              background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "12px 16px",
            }} aria-label="Node index">
              <div style={{
                fontSize: "12px", fontWeight: 600, color: "#64748b",
                textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 10,
              }}>Node index</div>
              {SAMPLE_NODES.map(n => {
                const nc = NODE_COLOURS[n.node_type] || NODE_COLOURS.narrative;
                return (
                  <div key={n.id} style={{
                    display: "flex", alignItems: "center", gap: 8,
                    padding: "6px 0", cursor: "pointer",
                    borderBottom: "1px solid #f8fafc",
                  }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: 2,
                      background: nc.badge, flexShrink: 0,
                    }} />
                    <span style={{
                      fontSize: "13px", color: "#1e293b",
                      fontWeight: 500, overflow: "hidden",
                      textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>{n.title}</span>
                    {n.checkpoint && (
                      <span style={{
                        width: 3, height: 10, borderRadius: 1.5,
                        background: "#d97706", flexShrink: 0, marginLeft: "auto",
                      }} />
                    )}
                  </div>
                );
              })}
            </nav>
          </div>
        </aside>
      </div>
    </div>
  );
}
