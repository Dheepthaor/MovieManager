
import { useEffect,useRef, useState} from "react";
import { request } from "./api";
import "./App.css";

const GENRES = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller",
];

const PLATFORMS = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other",
];

const EMPTY_FORM = {
  title: "",
  genre: "Action",
  releaseYear: String(new Date().getFullYear()),
  runtime: "120",
  platform: "Netflix",
  priority: "3",
};

function App() {
  const [movies, setMovies] = useState([]);
  const [stats, setStats] = useState(null);
  const [pagination, setPagination] = useState({
    currentPage: 1,
    totalPages: 0,
    totalMovies: 0,
  });
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [editingMovie, setEditingMovie] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const formPanelRef = useRef(null);
const [formScrollSignal, setFormScrollSignal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [recommended, setRecommended] = useState(null);
  const [recommendationError, setRecommendationError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);

      try {
        const params = new URLSearchParams({ page: String(page) });
        if (search.trim()) params.set("search", search.trim());
        if (statusFilter) params.set("status", statusFilter);
        if (genreFilter) params.set("genre", genreFilter);

        const [movieData, statsData] = await Promise.all([
          request(`/movies?${params.toString()}`),
          request("/movies/stats"),
        ]);

        if (cancelled) return;

        const totalPages = movieData.pagination.totalPages;

        if (
          (totalPages === 0 && page !== 1) ||
          (totalPages > 0 && page > totalPages)
        ) {
          setPage(totalPages || 1);
          return;
        }

        setMovies(movieData.movies);
        setPagination(movieData.pagination);
        setStats(statsData);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [page, search, statusFilter, genreFilter, reloadToken]);
   useEffect(() => {
  if (formOpen) {
    formPanelRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}, [formOpen, formScrollSignal]);
  function refresh() {
    setReloadToken((value) => value + 1);
  }

  function showMessage(message) {
    setNotice(message);
    setError("");
    setTimeout(() => setNotice(""), 3500);
  }
function openAddForm() {
  setEditingMovie(null);
  setForm({ ...EMPTY_FORM });
  setError("");
  setFormOpen(true);
  setFormScrollSignal((value) => value + 1);
}
  function openEditForm(movie) {
    setEditingMovie(movie);
    setForm({
      title: movie.title,
      genre: movie.genre,
      runtime: String(movie.runtime),
      platform: movie.platform,
      priority: String(movie.priority),
    });
    setFormOpen(true);
    setError("");
  }

  function closeForm() {
    setFormOpen(false);
    setEditingMovie(null);
    setForm({ ...EMPTY_FORM });
  }

  function updateField(event) {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setNotice("");

    const payload = {
      title: form.title.trim(),
      genre: form.genre,
      runtime: Number(form.runtime),
      platform: form.platform,
      priority: Number(form.priority),
    };

    if (!editingMovie) {
      payload.releaseYear = Number(form.releaseYear);
    }

    try {
      if (editingMovie) {
        await request(`/movies/${editingMovie._id}`, {
          method: "PUT",
          body: payload,
        });
        showMessage("Movie updated successfully.");
      } else {
        await request("/movies", {
          method: "POST",
          body: payload,
        });
        showMessage("Movie added to your watchlist.");
      }

      closeForm();
      setPage(1);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function changeStatus(movie, nextStatus) {
    if (!nextStatus) return;

    const allowed = {
      "To Watch": ["Watching", "Watched"],
      Watching: ["Watched", "To Watch"],
      Watched: [],
    };

    if (!allowed[movie.status]?.includes(nextStatus)) {
      setError("That status change is not allowed.");
      return;
    }

    const payload = { status: nextStatus };

    if (nextStatus === "Watched") {
      const input = window.prompt(
        `Enter your rating for "${movie.title}" (1–10):`
      );

      if (input === null) return;

      if (
        !input.trim() ||
        !Number.isFinite(Number(input)) ||
        Number(input) < 1 ||
        Number(input) > 10
      ) {
        setError("Please enter a rating from 1 to 10.");
        return;
      }

      payload.rating = Number(input);
    }

    try {
      await request(`/movies/${movie._id}/status`, {
        method: "PATCH",
        body: payload,
      });
      showMessage(`"${movie.title}" is now ${nextStatus}.`);
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function editRating(movie) {
    const input = window.prompt(
      `Enter a new rating for "${movie.title}" (1–10):`,
      String(movie.rating ?? "")
    );

    if (input === null) return;

    if (
      !input.trim() ||
      !Number.isFinite(Number(input)) ||
      Number(input) < 1 ||
      Number(input) > 10
    ) {
      setError("Please enter a rating from 1 to 10.");
      return;
    }

    try {
      await request(`/movies/${movie._id}/rating`, {
        method: "PATCH",
        body: { rating: Number(input) },
      });
      showMessage("Rating updated.");
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteMovie(movie) {
    if (movie.status === "Watching") return;

    const confirmed = window.confirm(
      `Delete "${movie.title}" from your watchlist?`
    );

    if (!confirmed) return;

    try {
      await request(`/movies/${movie._id}`, {
        method: "DELETE",
        method: "DELETE",
      });
      showMessage("Movie deleted successfully.");
      refresh();
    } catch (err) {
      setError(err.message);
    }
  }

  async function getWatchNext() {
    setRecommendationError("");
    setRecommended(null);

    try {
      const movie = await request("/movies/watch-next");
      setRecommended(movie);
    } catch (err) {
      setRecommendationError(err.message);
    }
  }

  const statusCounts = stats?.statusCounts || {
    "To Watch": 0,
    Watching: 0,
    Watched: 0,
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="brand-icon">C</span>
          <span>CineTrack<span className="brand-dot">.</span></span>
        </a>

        <div className="topbar-right">
          <span className="live-dot" />
          YOUR PERSONAL CINEMA
          <button className="button button-primary top-add" onClick={openAddForm}>
            + Add movie
          </button>
        </div>
      </header>

      <main id="top" className="page-container">
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span /> YOUR WATCHLIST, REIMAGINED</div>
            <h1>Your next great<br />film starts <em>here.</em></h1>
            <p>
              Keep the stories you love in one place. Decide what to watch,
              track your progress, and remember every rating.
            </p>
            <div className="hero-actions">
              <button className="button button-primary" onClick={getWatchNext}>
                ▶ What should I watch next?
              </button>
              <button className="button button-ghost" onClick={openAddForm}>
                + Add a movie
              </button>
            </div>
          </div>

          <div className="hero-art" aria-hidden="true">
            <div className="poster poster-back">
              <span>THE</span><strong>UNKNOWN</strong><small>A FILM FOR LATER</small>
            </div>
            <div className="poster poster-front">
              <div className="poster-orbit" />
              <span>YOUR NEXT</span><strong>FAVORITE</strong><small>IS WAITING</small>
            </div>
            <div className="art-caption">ONE STORY AT A TIME <span>✦</span></div>
          </div>
        </section>

        {recommended && (
          <section className="recommendation">
            <div>
              <div className="eyebrow">✦ YOUR NEXT PICK</div>
              <h2>{recommended.title}</h2>
              <p>
                {recommended.releaseYear} · {recommended.genre} · {recommended.runtime} min
                · Priority {recommended.priority}/5
              </p>
              <span className="movie-code">{recommended.movieCode}</span>
            </div>
            <button className="icon-button" onClick={() => setRecommended(null)} aria-label="Close recommendation">×</button>
          </section>
        )}

        {recommendationError && (
          <div className="alert alert-error">
            {recommendationError}
            <button onClick={() => setRecommendationError("")} aria-label="Dismiss">×</button>
          </div>
        )}

        {error && (
          <div className="alert alert-error" role="alert">
            <span>⚠ {error}</span>
            <button onClick={() => setError("")} aria-label="Dismiss">×</button>
          </div>
        )}

        {notice && <div className="alert alert-success" role="status">✓ {notice}</div>}

        <section className="stats-grid">
          <article className="stat-card">
            <div className="stat-top"><span>IN YOUR COLLECTION</span><span className="stat-icon violet">▤</span></div>
            <strong>{pagination.totalMovies}</strong>
            <small>Total movies</small>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>UP NEXT</span><span className="stat-icon amber">◷</span></div>
            <strong>{statusCounts["To Watch"]}</strong>
            <small>Ready to discover</small>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>TIME WELL SPENT</span><span className="stat-icon blue">◴</span></div>
            <strong>{stats?.totalHoursWatched ?? 0}<small className="inline-unit">h</small></strong>
            <small>Total watch time</small>
          </article>
          <article className="stat-card">
            <div className="stat-top"><span>YOUR AVERAGE</span><span className="stat-icon pink">★</span></div>
            <strong>{stats?.averageRating == null ? "—" : stats.averageRating}<small className="inline-unit">/10</small></strong>
            <small>Watched movie rating</small>
          </article>
        </section>

        <div className="section-heading">
          <div>
            <div className="eyebrow">THE COLLECTION</div>
            <h2>Your watchlist<span className="heading-period">.</span></h2>
          </div>
          <span className="collection-count">
            {pagination.totalMovies} {pagination.totalMovies === 1 ? "FILM" : "FILMS"}
          </span>
        </div>

        <section className="toolbar">
          <label className="search-box">
            <span>⌕</span>
            <input
              type="search"
              placeholder="Search your movies..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => { setStatusFilter(event.target.value); setPage(1); }}
          >
            <option value="">All statuses</option>
            <option>To Watch</option>
            <option>Watching</option>
            <option>Watched</option>
          </select>
          <select
            aria-label="Filter by genre"
            value={genreFilter}
            onChange={(event) => { setGenreFilter(event.target.value); setPage(1); }}
          >
            <option value="">All genres</option>
            {GENRES.map((genre) => <option key={genre}>{genre}</option>)}
          </select>
        </section>

        <div className="dashboard-layout">
          <section className="collection">
            {loading ? (
              <div className="empty-state"><span className="loader" /> Loading your collection…</div>
            ) : movies.length === 0 ? (
              <div className="empty-state">
                <div className="empty-symbol">✳</div>
                <h3>Your next story starts here</h3>
                <p>
                  {search || statusFilter || genreFilter
                    ? "No movies match these filters. Try changing your search."
                    : "Your watchlist is empty. Add a movie you have been meaning to watch."}
                </p>
                {!search && !statusFilter && !genreFilter && (
                  <button className="button button-primary" onClick={openAddForm}>Add your first movie</button>
                )}
              </div>
            ) : (
              <>
                <div className="movie-grid">
                  {movies.map((movie) => (
                    <article className="movie-card" key={movie._id}>
                      <div className="movie-card-top">
                        <span className="movie-code">{movie.movieCode}</span>
                        <span className={`status-badge status-${movie.status === "To Watch" ? "to-watch" : movie.status === "Watching" ? "watching" : "watched"}`}>
                          {movie.status}
                        </span>
                      </div>
                      <div className="movie-card-main">
                        <div className="movie-mini-poster" aria-hidden="true">
                          <span>{movie.title.trim().charAt(0).toUpperCase()}</span>
                          <i>✦</i>
                        </div>
                        <div className="movie-info">
                          <h3>{movie.title}</h3>
                          <p>{movie.genre} <span>·</span> {movie.releaseYear}</p>
                          <p className="runtime-line">{movie.runtime} min <span>·</span> {movie.platform}</p>
                        </div>
                      </div>
                      <div className="movie-details">
                        <span className="priority-label">PRIORITY <strong>{movie.priority}<small>/5</small></strong></span>
                        {movie.status === "Watched" && movie.rating != null && (
                          <span className="rating">★ {movie.rating}<small>/10</small></span>
                        )}
                      </div>
                      <div className="movie-actions">
                        {movie.status !== "Watched" ? (
                          <select
                            aria-label={`Change status for ${movie.title}`}
                            defaultValue=""
                            onChange={(event) => {
                              const next = event.target.value;
                              event.target.value = "";
                              if (next) changeStatus(movie, next);
                            }}
                          >
                            <option value="" disabled>Change status…</option>
                            {(movie.status === "To Watch"
                              ? ["Watching", "Watched"]
                              : ["Watched", "To Watch"]
                            ).map((status) => <option key={status} value={status}>{status}</option>)}
                          </select>
                        ) : (
                          <button className="text-action completed-action" disabled>✓ Completed</button>
                        )}
                        <div className="card-action-buttons">
                          {movie.status === "Watched" && (
                            <button className="text-action" onClick={() => editRating(movie)}>Rate</button>
                          )}
                          <button className="text-action" onClick={() => openEditForm(movie)}>Edit</button>
                          <button
                            className="text-action delete-action"
                            disabled={movie.status === "Watching"}
                            title={movie.status === "Watching" ? "A movie in Watching status cannot be deleted" : "Delete movie"}
                            onClick={() => deleteMovie(movie)}
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="pagination">
                  <span>Page {pagination.currentPage} of {pagination.totalPages}</span>
                  <div>
                    <button
                      className="button button-ghost"
                      disabled={page <= 1 || loading}
                      onClick={() => setPage((current) => current - 1)}
                    >← Previous</button>
                    <button
                      className="button button-ghost"
                      disabled={page >= pagination.totalPages || loading}
                      onClick={() => setPage((current) => current + 1)}
                    >Next →</button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="side-column">
            {formOpen ? (
             <section className="panel form-panel"
  ref={formPanelRef}>
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">{editingMovie ? "REFINE YOUR LIST" : "MAKE IT A MOVIE NIGHT"}</div>
                    <h3>{editingMovie ? "Edit movie" : "Add a movie"}</h3>
                  </div>
                  <button className="icon-button" onClick={closeForm} aria-label="Close form">×</button>
                </div>

                <form className="movie-form" onSubmit={handleSubmit}>
                  <label className="field">
                    <span>Movie title *</span>
                    <input name="title" value={form.title} onChange={updateField} required maxLength={150} placeholder="e.g. Interstellar" />
                  </label>

                  <div className="field-grid">
                    <label className="field">
                      <span>Genre *</span>
                      <select name="genre" value={form.genre} onChange={updateField} required>
                        {GENRES.map((genre) => <option key={genre}>{genre}</option>)}
                      </select>
                    </label>
                    {!editingMovie && (
                      <label className="field">
                        <span>Release year *</span>
                        <input
                          name="releaseYear"
                          type="number"
                          min="1950"
                          max={new Date().getFullYear()}
                          step="1"
                          value={form.releaseYear}
                          onChange={updateField}
                          required
                        />
                      </label>
                    )}
                  </div>

                  <div className="field-grid">
                    <label className="field">
                      <span>Runtime (min) *</span>
                      <input name="runtime" type="number" min="30" max="300" step="1" value={form.runtime} onChange={updateField} required />
                    </label>
                    <label className="field">
                      <span>Priority *</span>
                      <select name="priority" value={form.priority} onChange={updateField} required>
                        {[1, 2, 3, 4, 5].map((priority) => (
                          <option key={priority} value={priority}>{priority}{priority === 5 ? " — Highest" : ""}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <label className="field">
                    <span>Platform *</span>
                    <select name="platform" value={form.platform} onChange={updateField} required>
                      {PLATFORMS.map((platform) => <option key={platform}>{platform}</option>)}
                    </select>
                  </label>

                  {!editingMovie && (
                    <div className="form-note">
                      <span>✦</span> Your movie code will be generated automatically.
                    </div>
                  )}
                  {editingMovie && (
                    <div className="form-note">
                      <span>✦</span> Movie code and release year cannot be changed.
                    </div>
                  )}

                  <button className="button button-primary submit-button" type="submit">
                    {editingMovie ? "Save changes" : "Add to watchlist"} <span>→</span>
                  </button>
                  <button className="cancel-button" type="button" onClick={closeForm}>Cancel</button>
                </form>
              </section>
            ) : (
              <>
                <section className="panel next-panel">
                  <div className="next-art"><span>✳</span></div>
                  <div className="eyebrow">A LITTLE INSPIRATION</div>
                  <h3>Too many choices?</h3>
                  <p>Let your priority list make the decision. We'll pick the highest-priority film, with runtime as the tiebreaker.</p>
                  <button className="button button-primary full-button" onClick={getWatchNext}>Find my next film <span>→</span></button>
                </section>

                <section className="panel status-panel">
                  <div className="eyebrow">YOUR PROGRESS</div>
                  <h3>The story so far</h3>
                  {[
                    { name: "To Watch", value: statusCounts["To Watch"], color: "bar-purple" },
                    { name: "Watching", value: statusCounts.Watching, color: "bar-blue" },
                    { name: "Watched", value: statusCounts.Watched, color: "bar-green" },
                  ].map((item) => (
                    <div className="progress-item" key={item.name}>
                      <div><span>{item.name}</span><strong>{item.value}</strong></div>
                      <div className="progress-track"><span className={item.color} style={{ width: `${pagination.totalMovies ? (item.value / pagination.totalMovies) * 100 : 0}%` }} /></div>
                    </div>
                  ))}
                  <div className="top-genre">
                    <span>YOUR TOP WATCHED GENRE</span>
                    <strong>{stats?.topWatchedGenre?.genre || "Not yet discovered"}</strong>
                  </div>
                </section>
              </>
            )}
          </aside>
        </div>

        <footer className="footer">
          <a className="brand" href="#top"><span className="brand-icon">C</span><span>CineTrack<span className="brand-dot">.</span></span></a>
          <span>MADE FOR YOUR NEXT MOVIE NIGHT <b>✦</b></span>
        </footer>
      </main>
    </div>
  );
}

export default App;
