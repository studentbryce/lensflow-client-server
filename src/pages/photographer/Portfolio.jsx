import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  BiCheckCircle,
  BiCollection,
  BiErrorCircle,
  BiImage,
  BiMove,
  BiPlus,
  BiCircle,
} from "react-icons/bi";
import { apiListPhotographerPortfolio, apiUpdatePortfolioItem, apiDeletePortfolioItem, apiReorderPortfolio } from "../../services/photographerWebsiteApi";
import "./Portfolio.css";

export default function Portfolio() {
  const navigate = useNavigate();

  const [portfolioItems, setPortfolioItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [photographerId, setPhotographerId] = useState(null);

  const [deleteItem, setDeleteItem] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [draggedItemId, setDraggedItemId] = useState(null);
  const [dragOverItemId, setDragOverItemId] = useState(null);

  const [orderChanged, setOrderChanged] = useState(false);
  const [savingOrder, setSavingOrder] = useState(false);

  useEffect(() => {
    loadPortfolio();
  }, []);

  /* =========================================
     LOAD PORTFOLIO
  ========================================== */

  async function loadPortfolio() {
    try {
      setLoading(true);
      setError("");
      setOrderChanged(false);

      const response = await apiListPhotographerPortfolio();
      setPhotographerId(response.photographer_id);
      const data = response.items;

      /*
       * The display order is normalised in the UI.
       *
       * This means the cards always show:
       * #0
       * #1
       * #2
       * etc.
       *
       * The actual database values are only changed
       * when the user clicks Save Order.
       */
      const normalisedItems = (data || []).map(
        (item, index) => ({
          ...item,
          display_order: index,
        })
      );

      setPortfolioItems(normalisedItems);
    } catch (err) {
      console.error(
        "Error loading portfolio:",
        err
      );

      setError(
        err.message ||
          "Unable to load your portfolio. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  /* =========================================
     DRAG START
  ========================================== */

  function handleDragStart(event, itemId) {
    setDraggedItemId(itemId);
    setDragOverItemId(null);

    /*
     * Required by some browsers for HTML5 drag events.
     */
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "text/plain",
      itemId
    );
  }

  /* =========================================
     DRAG OVER
  ========================================== */

  function handleDragOver(event, itemId) {
    event.preventDefault();

    if (!draggedItemId) {
      return;
    }

    if (draggedItemId === itemId) {
      return;
    }

    event.dataTransfer.dropEffect = "move";

    setDragOverItemId(itemId);
  }

  /* =========================================
     DROP
  ========================================== */

  function handleDrop(event, targetItemId) {
    event.preventDefault();

    if (!draggedItemId) {
      return;
    }

    if (draggedItemId === targetItemId) {
      handleDragEnd();
      return;
    }

    setPortfolioItems((currentItems) => {
      const draggedIndex =
        currentItems.findIndex(
          (item) =>
            item.portfolio_id === draggedItemId
        );

      const targetIndex =
        currentItems.findIndex(
          (item) =>
            item.portfolio_id === targetItemId
        );

      if (
        draggedIndex === -1 ||
        targetIndex === -1
      ) {
        return currentItems;
      }

      const updatedItems = [
        ...currentItems,
      ];

      const [draggedItem] =
        updatedItems.splice(
          draggedIndex,
          1
        );

      updatedItems.splice(
        targetIndex,
        0,
        draggedItem
      );

      /*
       * Re-number the entire array so there are
       * never gaps or duplicate order numbers.
       */
      return updatedItems.map(
        (item, index) => ({
          ...item,
          display_order: index,
        })
      );
    });

    setOrderChanged(true);
    setDragOverItemId(null);
  }

  /* =========================================
     DRAG END
  ========================================== */

  function handleDragEnd() {
    setDraggedItemId(null);
    setDragOverItemId(null);
  }

  /* =========================================
     SAVE ORDER
  ========================================== */

  async function saveOrder() {
    if (
      !photographerId ||
      portfolioItems.length === 0 ||
      savingOrder
    ) {
      return;
    }

    try {
      setSavingOrder(true);
      setError("");

      /*
       * Because display_order will be UNIQUE per photographer,
       * we cannot directly change:
       *
       * A = 0
       * B = 1
       *
       * to:
       *
       * A = 1
       * B = 0
       *
       * as this can temporarily violate the unique constraint.
       *
       * Therefore:
       *
       * 1. Assign temporary negative values.
       * 2. Assign the final 0,1,2... values.
       */

      await apiReorderPortfolio(portfolioItems.map(item => item.portfolio_id));

      /*
       * Keep local state aligned with the database.
       */
      setPortfolioItems(
        (currentItems) =>
          currentItems.map(
            (item, index) => ({
              ...item,
              display_order: index,
            })
          )
      );

      setOrderChanged(false);
    } catch (err) {
      console.error(
        "Error saving portfolio order:",
        err
      );

      setError(
        err.message ||
          "Unable to save the portfolio order. Please try again."
      );

      /*
       * Reload from the database so the UI does not
       * remain in a potentially inconsistent state.
       */
      await loadPortfolio();
    } finally {
      setSavingOrder(false);
    }
  }

  /* =========================================
     TOGGLE PUBLISHED
  ========================================== */

  async function togglePublished(item) {
    try {
      setError("");

      const data = await apiUpdatePortfolioItem(item.portfolio_id, { published: !item.published });

      setPortfolioItems(
        (currentItems) =>
          currentItems.map(
            (portfolioItem) =>
              portfolioItem.portfolio_id ===
              item.portfolio_id
                ? {
                    ...data,
                    display_order:
                      portfolioItem.display_order,
                  }
                : portfolioItem
          )
      );
    } catch (err) {
      console.error(
        "Error updating portfolio item:",
        err
      );

      setError(
        err.message ||
          "Unable to update the portfolio item."
      );
    }
  }

  /* =========================================
     DELETE PORTFOLIO ITEM
  ========================================== */

  async function handleDelete() {
    if (!deleteItem) {
      return;
    }

    try {
      setDeleting(true);
      setError("");

      await apiDeletePortfolioItem(deleteItem.portfolio_id);

      /*
       * Remove the item locally and immediately
       * re-number the remaining items.
       */
      setPortfolioItems(
        (currentItems) =>
          currentItems
            .filter(
              (item) =>
                item.portfolio_id !==
                deleteItem.portfolio_id
            )
            .map(
              (item, index) => ({
                ...item,
                display_order: index,
              })
            )
      );

      /*
       * The deletion creates a potential gap in the
       * database ordering, so mark the order as changed.
       *
       * The photographer can save the new sequence.
       */
      setOrderChanged(true);
      setDeleteItem(null);
    } catch (err) {
      console.error(
        "Error deleting portfolio item:",
        err
      );

      setError(
        err.message ||
          "Unable to delete the portfolio item."
      );
    } finally {
      setDeleting(false);
    }
  }

  /* =========================================
     FORMAT DATE
  ========================================== */

  function formatDate(date) {
    if (!date) {
      return "";
    }

    return new Date(date).toLocaleDateString(
      "en-NZ",
      {
        day: "numeric",
        month: "short",
        year: "numeric",
      }
    );
  }

  /* =========================================
     LOADING
  ========================================== */

  if (loading) {
    return (
      <div className="portfolio-page">
        <div className="portfolio-loading">
          <div className="portfolio-spinner"></div>
          <p>Loading portfolio...</p>
        </div>
      </div>
    );
  }

  /* =========================================
     PAGE
  ========================================== */

  return (
    <div className="portfolio-page">

      {/* =========================
          PAGE HEADER
      ========================== */}

      <div className="portfolio-page-header">
        <div>
          <span className="portfolio-eyebrow">
            Photographer Dashboard
          </span>

          <h1>Portfolio</h1>

          <p>
            Showcase your best photography and
            manage the work displayed on your
            public website.
          </p>
        </div>

        <button
          className="portfolio-primary-button"
          onClick={() =>
            navigate(
              "/photographer/portfolio/new"
            )
          }
        >
          <BiPlus aria-hidden="true" />
          Add Portfolio Item
        </button>
      </div>

      {/* =========================
          ERROR MESSAGE
      ========================== */}

      {error && (
        <div className="portfolio-error">
          <div>
            <strong>
              Something went wrong
            </strong>

            <p>{error}</p>
          </div>

          <button onClick={loadPortfolio}>
            Try Again
          </button>
        </div>
      )}

      {/* =========================
          SUMMARY
      ========================== */}

      <div className="portfolio-summary">

        <div className="portfolio-summary-card">
          <div className="portfolio-summary-icon">
            <BiCollection aria-hidden="true" />
          </div>

          <div>
            <span>Total Items</span>

            <strong>
              {portfolioItems.length}
            </strong>
          </div>
        </div>

        <div className="portfolio-summary-card">
          <div className="portfolio-summary-icon">
            <BiCheckCircle aria-hidden="true" />
          </div>

          <div>
            <span>Published</span>

            <strong>
              {
                portfolioItems.filter(
                  (item) =>
                    item.published
                ).length
              }
            </strong>
          </div>
        </div>

        <div className="portfolio-summary-card">
          <div className="portfolio-summary-icon">
            <BiCircle aria-hidden="true" />
          </div>

          <div>
            <span>Drafts</span>

            <strong>
              {
                portfolioItems.filter(
                  (item) =>
                    !item.published
                ).length
              }
            </strong>
          </div>
        </div>

      </div>

      {/* =========================
          EMPTY STATE
      ========================== */}

      {portfolioItems.length === 0 ? (
        <div className="portfolio-empty">

          <div className="portfolio-empty-icon">
            <BiImage aria-hidden="true" />
          </div>

          <h2>
            Your portfolio is empty
          </h2>

          <p>
            Add your first portfolio item
            to start showcasing your
            photography on your public
            photographer website.
          </p>

          <button
            className="portfolio-primary-button"
            onClick={() =>
              navigate(
                "/photographer/portfolio/new"
              )
            }
          >
            <BiPlus aria-hidden="true" />
            Add Your First Item
          </button>

        </div>
      ) : (
        <>
          {/* =========================
              ORDER TOOLBAR
          ========================== */}

          <div
            className={`portfolio-order-toolbar ${
              orderChanged
                ? "unsaved"
                : ""
            }`}
          >

            <div className="portfolio-order-info">

              <div className="portfolio-order-icon">
                <BiMove aria-hidden="true" />
              </div>

              <div className="portfolio-order-text">

                <strong>
                  {orderChanged
                    ? "Unsaved portfolio order"
                    : "Portfolio order"}
                </strong>

                <span>
                  Drag and drop your images
                  to change their display order.
                </span>

              </div>

            </div>

            {orderChanged ? (
              <button
                className="portfolio-save-order-button"
                onClick={saveOrder}
                disabled={savingOrder}
              >
                {savingOrder
                  ? "Saving..."
                  : "Save Order"}
              </button>
            ) : (
              <span className="portfolio-order-saved">
                ✓ Order saved
              </span>
            )}

          </div>

          {/* =========================
              PORTFOLIO GRID
          ========================== */}

          <div className="portfolio-grid">

            {portfolioItems.map(
              (item) => {

                const isDragging =
                  draggedItemId ===
                  item.portfolio_id;

                const isDragOver =
                  dragOverItemId ===
                  item.portfolio_id;

                return (
                  <article
                    className={`portfolio-card ${
                      isDragging
                        ? "dragging"
                        : ""
                    } ${
                      isDragOver
                        ? "drag-over"
                        : ""
                    }`}
                    key={
                      item.portfolio_id
                    }
                    onDragOver={(event) =>
                      handleDragOver(
                        event,
                        item.portfolio_id
                      )
                    }
                    onDrop={(event) =>
                      handleDrop(
                        event,
                        item.portfolio_id
                      )
                    }
                  >

                    {/* =========================
                        IMAGE
                    ========================== */}

                    <div className="portfolio-card-image">

                      {item.thumbnail_url ||
                      item.media_url ? (
                        <img
                          src={
                            item.thumbnail_url ||
                            item.media_url
                          }
                          alt={
                            item.title ||
                            "Portfolio image"
                          }
                        />
                      ) : (
                        <div className="portfolio-no-image">
                          <BiImage aria-hidden="true" />
                          <p>No image</p>
                        </div>
                      )}

                      {/* DRAG HANDLE */}

                      <div
                        className="portfolio-drag-handle"
                        draggable
                        onDragStart={(event) =>
                          handleDragStart(
                            event,
                            item.portfolio_id
                          )
                        }
                        onDragEnd={
                          handleDragEnd
                        }
                        title="Drag to reorder"
                        aria-label={`Drag ${item.title || "portfolio item"} to reorder`}
                      >
                        <BiMove aria-hidden="true" />
                      </div>

                      {/* STATUS */}

                      <div
                        className={`portfolio-status ${
                          item.published
                            ? "published"
                            : "draft"
                        }`}
                      >
                        {item.published
                          ? "Published"
                          : "Draft"}
                      </div>

                    </div>

                    {/* =========================
                        CONTENT
                    ========================== */}

                    <div className="portfolio-card-content">

                      <div className="portfolio-card-top">

                        <div>
                          <h2>
                            {item.title ||
                              "Untitled Portfolio Item"}
                          </h2>

                          {item.category && (
                            <span className="portfolio-category">
                              {item.category}
                            </span>
                          )}
                        </div>

                        <span className="portfolio-order">
                          #{item.display_order}
                        </span>

                      </div>

                      {item.description && (
                        <p className="portfolio-description">
                          {item.description}
                        </p>
                      )}

                      <div className="portfolio-card-meta">
                        <span>
                          Added{" "}
                          {formatDate(
                            item.created_at
                          )}
                        </span>
                      </div>

                      {/* =========================
                          ACTIONS
                      ========================== */}

                      <div className="portfolio-card-actions">

                        <button
                          className="portfolio-action-button"
                          onClick={() =>
                            navigate(
                              `/photographer/portfolio/${item.portfolio_id}/edit`
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          className={`portfolio-action-button ${
                            item.published
                              ? "unpublish"
                              : "publish"
                          }`}
                          onClick={() =>
                            togglePublished(
                              item
                            )
                          }
                        >
                          {item.published
                            ? "Unpublish"
                            : "Publish"}
                        </button>

                        <button
                          className="portfolio-action-button danger"
                          onClick={() =>
                            setDeleteItem(
                              item
                            )
                          }
                        >
                          Delete
                        </button>

                      </div>

                    </div>

                  </article>
                );
              }
            )}

          </div>
        </>
      )}

      {/* =========================
          DELETE MODAL
      ========================== */}

      {deleteItem && (
        <div
          className="portfolio-modal-overlay"
          onClick={() =>
            !deleting &&
            setDeleteItem(null)
          }
        >
          <div
            className="portfolio-modal"
            onClick={(event) =>
              event.stopPropagation()
            }
          >

            <div className="portfolio-modal-icon">
              <BiErrorCircle aria-hidden="true" />
            </div>

            <h2>
              Delete Portfolio Item?
            </h2>

            <p>
              Are you sure you want to
              delete{" "}
              <strong>
                {deleteItem.title ||
                  "this portfolio item"}
              </strong>
              ?
            </p>

            <p className="portfolio-modal-warning">
              This action cannot be undone.
            </p>

            <div className="portfolio-modal-actions">

              <button
                className="portfolio-modal-cancel"
                onClick={() =>
                  setDeleteItem(null)
                }
                disabled={deleting}
              >
                Cancel
              </button>

              <button
                className="portfolio-modal-delete"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting
                  ? "Deleting..."
                  : "Delete Item"}
              </button>

            </div>

          </div>
        </div>
      )}

    </div>
  );
}