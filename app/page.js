"use client";

import { useEffect, useState } from "react";
import { Crown, Swords, Plus, Trash2, Search, Upload, X, LogOut } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";
import {
  signIn,
  signOut,
  loadKingdom,
  loadNextInLine,
  loadCuisines,
  loadStanding,
  addCuisine,
  promoteToThrone,
  addToNextInLine,
  removeFromNextInLine,
} from "@/lib/data";

const MIN_DECREE_LENGTH = 30;

async function callAi(body) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const res = await fetch("/api/ai", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session?.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "AI request failed");
  return json;
}

export default function Home() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [slots, setSlots] = useState([]);
  const [nextInLine, setNextInLine] = useState([]);
  const [cuisines, setCuisines] = useState([]);
  const [standing, setStanding] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(null);

  const [modal, setModal] = useState(null); // { type: "crown" | "addCuisine" | "addNextInLine" | "import", ... }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const [k, n, c, s] = await Promise.all([
          loadKingdom(user.id),
          loadNextInLine(user.id),
          loadCuisines(user.id),
          loadStanding(user.id),
        ]);
        setSlots(k);
        setNextInLine(n);
        setCuisines(c);
        setStanding(s);
        setLoaded(true);
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [user]);

  const refreshKingdom = async () => setSlots(await loadKingdom(user.id));
  const refreshNextInLine = async () => setNextInLine(await loadNextInLine(user.id));
  const refreshCuisines = async () => setCuisines(await loadCuisines(user.id));
  const refreshStanding = async () => setStanding(await loadStanding(user.id));

  const crown = async (cuisineId, cuisineName, entry, fromListId) => {
    await promoteToThrone(user.id, cuisineId, entry, fromListId);
    setSlots(await loadKingdom(user.id));
    if (fromListId) setNextInLine(await loadNextInLine(user.id));
    await refreshStanding();
  };

  const handleAddCuisine = async (name) => {
    await addCuisine(user.id, name);
    await refreshCuisines();
    await refreshKingdom();
    await refreshStanding();
  };

  const handleAddNextInLine = async (cuisineId, entry) => {
    await addToNextInLine(user.id, cuisineId, entry);
    await refreshNextInLine();
  };

  const handleRemoveNextInLine = async (id) => {
    await removeFromNextInLine(id);
    await refreshNextInLine();
  };

  if (!authChecked) {
    return <div className="page">Loading...</div>;
  }

  if (!user) {
    return <SignInScreen />;
  }

  return (
    <div className="page">
      <div className="top-bar">
        <div className="brand">
          <Crown className="crown-icon" size={26} />
          Nomarchy
        </div>
        <button className="btn ghost" onClick={signOut}>
          <LogOut size={15} /> Sign out
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {standing && (
        <div className="standing-bar">
          <div className="standing-stat">
            <span className="value">{standing.cuisineCount}</span>
            <span className="label">Cuisines</span>
          </div>
          <div className="standing-stat">
            <span className="value">{standing.throneCount}</span>
            <span className="label">Thrones filled</span>
          </div>
          <div className="standing-stat">
            <span className="value">{standing.coupCount}</span>
            <span className="label">Coups recorded</span>
          </div>
          {standing.longestReign && (
            <div className="standing-stat">
              <span className="value">{standing.longestReign.days}d</span>
              <span className="label">Longest reign - {standing.longestReign.restaurantName}</span>
            </div>
          )}
        </div>
      )}

      {!loaded ? (
        <p className="muted">Loading your kingdom...</p>
      ) : (
        <>
          <section>
            <div className="section-header">
              <h2>Your Kingdom</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn secondary small" onClick={() => setModal({ type: "import" })}>
                  <Upload size={14} /> Import
                </button>
                <button className="btn small" onClick={() => setModal({ type: "addCuisine" })}>
                  <Plus size={14} /> Cuisine
                </button>
              </div>
            </div>

            {slots.length === 0 ? (
              <div className="empty-state">
                No cuisines yet. Add one to start building your kingdom.
              </div>
            ) : (
              <div className="grid">
                {slots.map((slot) => (
                  <ThroneCard
                    key={slot.id}
                    slot={slot}
                    onCrown={() =>
                      setModal({
                        type: "crown",
                        cuisineId: slot.id,
                        cuisineName: slot.name,
                      })
                    }
                  />
                ))}
              </div>
            )}
          </section>

          <section>
            <div className="section-header">
              <h2>Next in Line</h2>
              <button
                className="btn small"
                disabled={cuisines.length === 0}
                onClick={() => setModal({ type: "addNextInLine" })}
              >
                <Plus size={14} /> Candidate
              </button>
            </div>

            {nextInLine.length === 0 ? (
              <div className="empty-state">
                Nobody is waiting for a throne yet.
              </div>
            ) : (
              <div className="next-in-line-list">
                {nextInLine.map((item) => (
                  <div key={item.id} className="next-in-line-row">
                    <div className="info">
                      <span className="name">{item.restaurantName}</span>
                      <span className="meta">
                        {item.cuisineName}
                        {item.address ? ` - ${item.address}` : ""}
                      </span>
                    </div>
                    <div className="row-actions">
                      <button
                        className="btn small"
                        onClick={() =>
                          setModal({
                            type: "crown",
                            cuisineId: item.cuisineId,
                            cuisineName: item.cuisineName,
                            fromListId: item.id,
                            prefill: {
                              restaurantName: item.restaurantName,
                              address: item.address,
                              placeId: item.placeId,
                            },
                          })
                        }
                      >
                        <Crown size={13} /> Crown
                      </button>
                      <button
                        className="btn ghost small"
                        onClick={() => handleRemoveNextInLine(item.id)}
                        aria-label="Remove"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {modal?.type === "addCuisine" && (
        <AddCuisineModal onClose={() => setModal(null)} onSubmit={handleAddCuisine} />
      )}

      {modal?.type === "crown" && (
        <CrownModal
          cuisineId={modal.cuisineId}
          cuisineName={modal.cuisineName}
          fromListId={modal.fromListId}
          prefill={modal.prefill}
          onClose={() => setModal(null)}
          onSubmit={crown}
        />
      )}

      {modal?.type === "addNextInLine" && (
        <AddNextInLineModal
          cuisines={cuisines}
          onClose={() => setModal(null)}
          onSubmit={handleAddNextInLine}
        />
      )}

      {modal?.type === "import" && (
        <ImportModal
          cuisines={cuisines}
          onClose={() => setModal(null)}
          onAddCuisine={async (name) => {
            const c = await addCuisine(user.id, name);
            await refreshCuisines();
            return c;
          }}
          onAddNextInLine={handleAddNextInLine}
        />
      )}
    </div>
  );
}

function SignInScreen() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signIn(email);
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="sign-in-wrap">
      <div className="sign-in-card">
        <div className="brand">
          <Crown className="crown-icon" size={28} />
          Nomarchy
        </div>
        <p className="tagline">A kingdom of your favorite restaurants, one cuisine at a time.</p>

        {sent ? (
          <p>Check your email for a sign-in link.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <input
              type="email"
              required
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {error && <div className="error-banner">{error}</div>}
            <button className="btn" type="submit" disabled={submitting}>
              {submitting ? "Sending..." : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function ThroneCard({ slot, onCrown }) {
  const { throne } = slot;
  return (
    <div className={`card throne-card ${throne ? "" : "empty"}`}>
      <div className="cuisine-name">{slot.name}</div>
      {throne ? (
        <>
          <div className="restaurant-name">{throne.restaurantName}</div>
          {throne.address && <div className="restaurant-address">{throne.address}</div>}
          <div className="decree">&ldquo;{throne.decree}&rdquo;</div>
          <div className="reign-length">
            Crowned {new Date(throne.crownedAt).toLocaleDateString()}
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn secondary small" onClick={onCrown}>
              <Swords size={13} /> Stage a coup
            </button>
          </div>
        </>
      ) : (
        <>
          <div className="empty-throne">No ruler yet.</div>
          <button className="btn small" onClick={onCrown}>
            <Crown size={13} /> Crown a restaurant
          </button>
        </>
      )}
    </div>
  );
}

function AddCuisineModal({ onClose, onSubmit }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const submit = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(name.trim());
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a cuisine" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Cuisine name</label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Thai"
          />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy || !name.trim()}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PlaceLookup({ cuisineName, onPick }) {
  const [query, setQuery] = useState("");
  const [city, setCity] = useState("");
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState(null);

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      const { results } = await callAi({
        mode: "lookup",
        query: query.trim() || cuisineName,
        city: city.trim(),
      });
      setResults(results);
    } catch (err) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="field">
      <label>Look up a place (optional)</label>
      <div style={{ display: "flex", gap: 6 }}>
        <input
          placeholder="Restaurant or search term"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input
          placeholder="City"
          style={{ maxWidth: 130 }}
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <button type="button" className="btn secondary" onClick={search} disabled={searching}>
          <Search size={14} />
        </button>
      </div>
      {searching && <div className="hint">Searching...</div>}
      {error && <div className="hint error">{error}</div>}
      {results && results.length === 0 && <div className="hint">No results found.</div>}
      {results && results.length > 0 && (
        <div className="lookup-results">
          {results.map((r, i) => (
            <div key={i} className="lookup-result" onClick={() => onPick(r)}>
              <div className="name">{r.name}</div>
              <div className="meta">
                {[r.address, r.neighborhood].filter(Boolean).join(" - ")}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CrownModal({ cuisineId, cuisineName, fromListId, prefill, onClose, onSubmit }) {
  const [restaurantName, setRestaurantName] = useState(prefill?.restaurantName ?? "");
  const [address, setAddress] = useState(prefill?.address ?? "");
  const [placeId, setPlaceId] = useState(prefill?.placeId ?? "");
  const [decree, setDecree] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const decreeTooShort = decree.trim().length < MIN_DECREE_LENGTH;

  const submit = async (e) => {
    e.preventDefault();
    if (!restaurantName.trim() || decreeTooShort) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(
        cuisineId,
        cuisineName,
        { restaurantName: restaurantName.trim(), address: address.trim() || null, placeId: placeId || null, decree: decree.trim() },
        fromListId
      );
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title={`Crown a ruler for ${cuisineName}`} onClose={onClose}>
      <form onSubmit={submit}>
        <PlaceLookup
          cuisineName={cuisineName}
          onPick={(r) => {
            setRestaurantName(r.name);
            setAddress(r.address ?? "");
            setPlaceId(r.placeId ?? "");
          }}
        />
        <div className="field">
          <label>Restaurant name</label>
          <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
        </div>
        <div className="field">
          <label>Address (optional)</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label>Decree - why do they deserve the throne?</label>
          <textarea value={decree} onChange={(e) => setDecree(e.target.value)} />
          <div className={`hint ${decreeTooShort && decree.length > 0 ? "error" : ""}`}>
            {decree.trim().length}/{MIN_DECREE_LENGTH} characters minimum
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy || !restaurantName.trim() || decreeTooShort}>
            <Crown size={14} /> Crown
          </button>
        </div>
      </form>
    </Modal>
  );
}

function AddNextInLineModal({ cuisines, onClose, onSubmit }) {
  const [cuisineId, setCuisineId] = useState(cuisines[0]?.id ?? "");
  const [restaurantName, setRestaurantName] = useState("");
  const [address, setAddress] = useState("");
  const [placeId, setPlaceId] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const cuisineName = cuisines.find((c) => c.id === cuisineId)?.name ?? "";

  const submit = async (e) => {
    e.preventDefault();
    if (!restaurantName.trim() || !cuisineId) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(cuisineId, {
        restaurantName: restaurantName.trim(),
        address: address.trim() || null,
        placeId: placeId || null,
        note: note.trim() || null,
      });
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Add a candidate" onClose={onClose}>
      <form onSubmit={submit}>
        <div className="field">
          <label>Cuisine</label>
          <select value={cuisineId} onChange={(e) => setCuisineId(e.target.value)}>
            {cuisines.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <PlaceLookup
          cuisineName={cuisineName}
          onPick={(r) => {
            setRestaurantName(r.name);
            setAddress(r.address ?? "");
            setPlaceId(r.placeId ?? "");
          }}
        />
        <div className="field">
          <label>Restaurant name</label>
          <input value={restaurantName} onChange={(e) => setRestaurantName(e.target.value)} />
        </div>
        <div className="field">
          <label>Address (optional)</label>
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <input value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="modal-actions">
          <button type="button" className="btn ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn" disabled={busy || !restaurantName.trim()}>
            Add
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ImportModal({ cuisines, onClose, onAddCuisine, onAddNextInLine }) {
  const [text, setText] = useState("");
  const [entries, setEntries] = useState(null);
  const [selected, setSelected] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const parse = async () => {
    setBusy(true);
    setError(null);
    try {
      const { entries } = await callAi({
        mode: "import",
        text,
        cuisines,
      });
      setEntries(entries);
      setSelected(Object.fromEntries(entries.map((_, i) => [i, true])));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const importSelected = async () => {
    setBusy(true);
    setError(null);
    try {
      const cuisineByName = new Map(cuisines.map((c) => [c.name.toLowerCase(), c.id]));
      for (let i = 0; i < entries.length; i++) {
        if (!selected[i]) continue;
        const entry = entries[i];
        let cuisineId = entry.matchedCuisineId;
        if (!cuisineId) {
          cuisineId = cuisineByName.get(entry.cuisineName.toLowerCase());
        }
        if (!cuisineId) {
          const created = await onAddCuisine(entry.cuisineName);
          cuisineId = created.id;
          cuisineByName.set(entry.cuisineName.toLowerCase(), cuisineId);
        }
        await onAddNextInLine(cuisineId, {
          restaurantName: entry.restaurantName,
          address: entry.address,
          note: entry.note,
        });
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Import restaurants" onClose={onClose}>
      {!entries ? (
        <>
          <div className="import-box">
            <textarea
              placeholder="Paste a list of restaurants, one per line or however they come..."
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={8000}
            />
          </div>
          <div className="hint">{text.length}/8000 characters</div>
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="btn" onClick={parse} disabled={busy || !text.trim()}>
              {busy ? "Reading..." : "Parse"}
            </button>
          </div>
        </>
      ) : (
        <>
          {entries.length === 0 ? (
            <p className="muted">No restaurants found in that text.</p>
          ) : (
            <div className="import-entries">
              {entries.map((entry, i) => (
                <label key={i} className="import-entry">
                  <input
                    type="checkbox"
                    checked={!!selected[i]}
                    onChange={(e) => setSelected({ ...selected, [i]: e.target.checked })}
                  />
                  <div className="info">
                    <strong>{entry.restaurantName}</strong>
                    <div className="muted">
                      {entry.cuisineName}
                      {entry.address ? ` - ${entry.address}` : ""}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          )}
          {error && <div className="error-banner">{error}</div>}
          <div className="modal-actions">
            <button type="button" className="btn ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn"
              onClick={importSelected}
              disabled={busy || entries.length === 0}
            >
              Add selected to Next in Line
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3>{title}</h3>
          <button className="btn ghost small" onClick={onClose} aria-label="Close">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
