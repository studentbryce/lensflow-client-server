import test from "node:test";
import assert from "node:assert/strict";
import { selectGalleryCoverMedia } from "../src/utils/selectGalleryCoverMedia.mjs";

const galleries = [{ gallery_id: "a" }, { gallery_id: "b" }, { gallery_id: "empty" }];
const media = [
  { gallery_id: "a", media_id: "video", media_type: "video", storage_path: "video.mp4" },
  { gallery_id: "a", media_id: "a-first", media_type: "image", storage_path: "original-a.jpg", thumbnail_path: "watermarked-a.webp" },
  { gallery_id: "a", media_id: "a-second", media_type: "image", storage_path: "original-a2.jpg" },
  { gallery_id: "b", media_id: "b-missing-original", media_type: "image", storage_path: null, thumbnail_path: "watermarked-b.webp" },
  { gallery_id: "b", media_id: "b-first", media_type: "image", storage_path: "original-b.png" },
  { gallery_id: "foreign", media_id: "foreign", media_type: "image", storage_path: "other.jpg" },
];

test("selects only one image per gallery before signing", () => {
  assert.deepEqual(selectGalleryCoverMedia(galleries, media).map((item) => item.media_id), ["a-first", "b-first"]);
});
test("always chooses original paths, never watermarked-only media", () => {
  const covers = selectGalleryCoverMedia(galleries, media);
  assert.ok(covers.every((item) => item.storage_path && !item.storage_path.endsWith(".webp")));
});
test("handles empty gallery lists and no media", () => {
  assert.deepEqual(selectGalleryCoverMedia([], media), []);
  assert.deepEqual(selectGalleryCoverMedia(galleries, []), []);
});
test("does not mutate source arrays", () => {
  const copy = media.map((item) => ({ ...item }));
  selectGalleryCoverMedia(galleries, media);
  assert.deepEqual(media, copy);
});
