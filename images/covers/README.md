# Card cover art

Cover images for catalogue entries. Two ways to get an image into an entry's
**Image URL** field:

## 1. Upload through the Content Manager (easiest)

Use the **Cover Image** picker in the Content Manager. It resizes the image in
your browser, uploads it to Netlify Blobs, and fills in the URL for you. Nothing
lands in this folder and nothing needs a commit or a deploy.

Use this for ordinary entry covers.

## 2. Commit a file here

Drop the file in this folder, commit, push, then enter the path in the Image
URL field:

    images/covers/my-cover.webp

Use this when the image should live in version control — art you want backed up
with the site, or anything reused across pages.

## Sizing

Keep covers around **800-1200px on the long edge** and **under ~200KB**. Prefer
`.webp`, then `.jpg`. Full-size PNGs straight from an art tool are typically
1-3MB each, which makes the catalogue slow on mobile and burns Netlify
bandwidth for no visible gain at card size.

The uploader applies these limits automatically. Files committed here are on
you.

Site chrome — banners, icons, backgrounds — stays in `images/`, not here.
