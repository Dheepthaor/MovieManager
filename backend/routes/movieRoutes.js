import express from "express";
import mongoose from "mongoose";
import Movie from "../models/Movie.js";
import Counter from "../models/Counter.js";

const router = express.Router();

const genres = [
  "Action", "Comedy", "Drama", "Horror",
  "Sci-Fi", "Romance", "Thriller",
];

const platforms = [
  "Netflix", "Prime Video", "Hotstar", "Theatre", "Other",
];

const statuses = ["To Watch", "Watching", "Watched"];
const pageSize = 6;

function sendError(res, error) {
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: "A movie with this title and release year already exists.",
      data: null,
    });
  }

  if (
    error.name === "ValidationError" ||
    error.name === "CastError"
  ) {
    return res.status(400).json({
      success: false,
      message: error.message,
      data: null,
    });
  }

  console.error(error);
  return res.status(500).json({
    success: false,
    message: "Internal server error.",
    data: null,
  });
}

function validId(id) {
  return mongoose.isValidObjectId(id);
}

// ADD MOVIE
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // These fields are controlled by the backend.
    if (
      ["movieCode", "status", "rating", "watchedDate"]
        .some((key) => Object.hasOwn(body, key))
    ) {
      return res.status(400).json({
        success: false,
        message: "Movie code, status, rating and watched date are managed by the server.",
        data: null,
      });
    }

    const title = typeof body.title === "string" ? body.title.trim() : "";
    const releaseYear = Number(body.releaseYear);
    const runtime = Number(body.runtime);
    const priority = Number(body.priority);

    if (!title || !body.genre || !body.platform) {
      return res.status(400).json({
        success: false,
        message: "Title, genre and platform are required.",
        data: null,
      });
    }

    if (
      !Number.isInteger(releaseYear) ||
      releaseYear < 1950 ||
      releaseYear > new Date().getFullYear()
    ) {
      return res.status(400).json({
        success: false,
        message: "Release year must be between 1950 and the current year.",
        data: null,
      });
    }

    if (!Number.isInteger(runtime) || runtime < 30 || runtime > 300) {
      return res.status(400).json({
        success: false,
        message: "Runtime must be between 30 and 300 minutes.",
        data: null,
      });
    }

    if (!Number.isInteger(priority) || priority < 1 || priority > 5) {
      return res.status(400).json({
        success: false,
        message: "Priority must be an integer from 1 to 5.",
        data: null,
      });
    }

    if (!genres.includes(body.genre) || !platforms.includes(body.platform)) {
      return res.status(400).json({
        success: false,
        message: "Invalid genre or platform.",
        data: null,
      });
    }

    // Case-insensitive duplicate check.
    const duplicate = await Movie.findOne({
      title,
      releaseYear,
    }).collation({ locale: "en", strength: 2 });

    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: "This movie title and release year already exist.",
        data: null,
      });
    }

    // Atomic counter: each release year has its own sequence.
    const counter = await Counter.findByIdAndUpdate(
      String(releaseYear),
      { $inc: { sequence: 1 } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    const movieCode =
      `MV-${releaseYear}-${String(counter.sequence).padStart(3, "0")}`;

    const movie = await Movie.create({
      movieCode,
      title,
      genre: body.genre,
      releaseYear,
      runtime,
      platform: body.platform,
      priority,
      // Status defaults to "To Watch" in the schema.
    });

    return res.status(201).json({
      success: true,
      message: "Movie added successfully.",
      data: movie,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// VIEW MOVIES: FILTER, SEARCH, SORT AND PAGINATE
router.get("/", async (req, res) => {
  try {
    const { status, genre } = req.query;
    const search = String(req.query.search || "").trim();
    const page = Number(req.query.page || 1);

    if (!Number.isInteger(page) || page < 1) {
      return res.status(400).json({
        success: false,
        message: "Page must be a positive integer.",
        data: null,
      });
    }

    if (status && !statuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid status filter.",
        data: null,
      });
    }

    if (genre && !genres.includes(genre)) {
      return res.status(400).json({
        success: false,
        message: "Invalid genre filter.",
        data: null,
      });
    }

    const filter = {};
    if (status) filter.status = status;
    if (genre) filter.genre = genre;

    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      filter.title = { $regex: escaped, $options: "i" };
    }

    const [totalMovies, movies] = await Promise.all([
      Movie.countDocuments(filter),
      Movie.aggregate([
        { $match: filter },
        {
          $addFields: {
            statusOrder: {
              $switch: {
                branches: [
                  { case: { $eq: ["$status", "To Watch"] }, then: 0 },
                  { case: { $eq: ["$status", "Watching"] }, then: 1 },
                  { case: { $eq: ["$status", "Watched"] }, then: 2 },
                ],
                default: 3,
              },
            },
          },
        },
        { $sort: { statusOrder: 1, priority: -1, createdAt: -1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        { $project: { statusOrder: 0 } },
      ]),
    ]);

    return res.status(200).json({
      success: true,
      message: "Movies retrieved successfully.",
      data: {
        movies,
        pagination: {
          currentPage: page,
          totalPages: Math.ceil(totalMovies / pageSize),
          totalMovies,
          perPage: pageSize,
        },
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// STATISTICS DASHBOARD
router.get("/stats", async (req, res) => {
  try {
    const [statusCounts, watchedStats, watchedGenres] = await Promise.all([
      Movie.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Movie.aggregate([
        { $match: { status: "Watched" } },
        {
          $group: {
            _id: null,
            totalRuntime: { $sum: "$runtime" },
            averageRating: { $avg: "$rating" },
          },
        },
      ]),
      Movie.aggregate([
        { $match: { status: "Watched" } },
        { $group: { _id: "$genre", count: { $sum: 1 } } },
        { $sort: { count: -1, _id: 1 } },
        { $limit: 1 },
      ]),
    ]);

    const totals = {
      "To Watch": 0,
      Watching: 0,
      Watched: 0,
    };

    statusCounts.forEach(({ _id, count }) => {
      totals[_id] = count;
    });

    const watched = watchedStats[0] || {
      totalRuntime: 0,
      averageRating: null,
    };

    return res.status(200).json({
      success: true,
      message: "Statistics retrieved successfully.",
      data: {
        statusCounts: totals,
        totalRuntimeMinutes: watched.totalRuntime,
        totalHoursWatched:
          Math.round((watched.totalRuntime / 60) * 10) / 10,
        averageRating:
          watched.averageRating == null
            ? null
            : Math.round(watched.averageRating * 10) / 10,
        topWatchedGenre: watchedGenres.length
          ? {
              genre: watchedGenres[0]._id,
              count: watchedGenres[0].count,
            }
          : null,
      },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// WATCH NEXT
router.get("/watch-next", async (req, res) => {
  try {
    const movie = await Movie.findOne({ status: "To Watch" })
      .sort({ priority: -1, runtime: 1 });

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "There are no movies left to watch.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Here is your next movie to watch.",
      data: movie,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// GET A SINGLE MOVIE
router.get("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID.",
        data: null,
      });
    }

    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found.",
        data: null,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Movie retrieved successfully.",
      data: movie,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// EDIT ONLY TITLE, GENRE, RUNTIME, PLATFORM AND PRIORITY
router.put("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID.",
        data: null,
      });
    }

    const body = req.body || {};
    const allowed = ["title", "genre", "runtime", "platform", "priority"];
    const keys = Object.keys(body);

    if (!keys.length || keys.some((key) => !allowed.includes(key))) {
      return res.status(400).json({
        success: false,
        message: "Only title, genre, runtime, platform and priority can be edited here.",
        data: null,
      });
    }

    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found.",
        data: null,
      });
    }

    if (Object.hasOwn(body, "title")) {
      if (typeof body.title !== "string" || !body.title.trim()) {
        return res.status(400).json({
          success: false,
          message: "Title cannot be empty.",
          data: null,
        });
      }

      body.title = body.title.trim();

      const duplicate = await Movie.findOne({
        title: body.title,
        releaseYear: movie.releaseYear,
        _id: { $ne: movie._id },
      }).collation({ locale: "en", strength: 2 });

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "This movie title and release year already exist.",
          data: null,
        });
      }
    }

    keys.forEach((key) => {
      movie[key] = body[key];
    });

    const updated = await movie.save();

    return res.status(200).json({
      success: true,
      message: "Movie updated successfully.",
      data: updated,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// CHANGE STATUS: ENFORCE THE WORKFLOW
router.patch("/:id/status", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID.",
        data: null,
      });
    }

    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found.",
        data: null,
      });
    }

    if (movie.status === "Watched") {
      return res.status(400).json({
        success: false,
        message: "Watched is a final status and cannot be changed.",
        data: null,
      });
    }

    const transitions = {
      "To Watch": ["Watching", "Watched"],
      Watching: ["Watched", "To Watch"],
      Watched: [],
    };

    const { status, rating } = req.body || {};

    if (!transitions[movie.status].includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status transition from ${movie.status} to ${status}.`,
        data: null,
      });
    }

    const ratingProvided =
      rating !== undefined && rating !== null && rating !== "";

    if (status !== "Watched" && ratingProvided) {
      return res.status(400).json({
        success: false,
        message: "Rating is allowed only when a movie is marked Watched.",
        data: null,
      });
    }

    if (status === "Watched") {
      const numericRating = Number(rating);

      if (
        !ratingProvided ||
        !Number.isFinite(numericRating) ||
        numericRating < 1 ||
        numericRating > 10
      ) {
        return res.status(400).json({
          success: false,
          message: "A rating from 1 to 10 is required when marking a movie Watched.",
          data: null,
        });
      }

      movie.rating = numericRating;
      movie.watchedDate = new Date();
    } else {
      movie.rating = null;
      movie.watchedDate = null;
    }

    movie.status = status;
    const updated = await movie.save();

    return res.status(200).json({
      success: true,
      message: "Movie status updated successfully.",
      data: updated,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// EDIT RATING FOR AN ALREADY-WATCHED MOVIE
router.patch("/:id/rating", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID.",
        data: null,
      });
    }

    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found.",
        data: null,
      });
    }

    if (movie.status !== "Watched") {
      return res.status(400).json({
        success: false,
        message: "Only Watched movies can have a rating.",
        data: null,
      });
    }

    const rating = Number(req.body?.rating);

    if (
      req.body?.rating === undefined ||
      req.body?.rating === null ||
      req.body?.rating === "" ||
      !Number.isFinite(rating) ||
      rating < 1 ||
      rating > 10
    ) {
      return res.status(400).json({
        success: false,
        message: "Rating must be a number from 1 to 10.",
        data: null,
      });
    }

    movie.rating = rating;
    const updated = await movie.save();

    return res.status(200).json({
      success: true,
      message: "Rating updated successfully.",
      data: updated,
    });
  } catch (error) {
    return sendError(res, error);
  }
});

// DELETE: WATCHING MOVIES CANNOT BE DELETED
router.delete("/:id", async (req, res) => {
  try {
    if (!validId(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid movie ID.",
        data: null,
      });
    }

    const movie = await Movie.findById(req.params.id);

    if (!movie) {
      return res.status(404).json({
        success: false,
        message: "Movie not found.",
        data: null,
      });
    }

    if (movie.status === "Watching") {
      return res.status(400).json({
        success: false,
        message: "Movies currently Watching cannot be deleted.",
        data: null,
      });
    }

    await movie.deleteOne();

    return res.status(200).json({
      success: true,
      message: "Movie deleted successfully.",
      data: { id: movie._id },
    });
  } catch (error) {
    return sendError(res, error);
  }
});

export default router;