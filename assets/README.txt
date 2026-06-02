# assets/ — drop your images here

I couldn't read `C:\Users\bruno\Documents\MyFiles\Portfolio` (no access to your local
drive), so the site currently loads images from your existing live site's CDN — it
works as-is. To host everything from your own files instead, drop images into this
folder and swap the URLs.

## Where each image is referenced

PORTRAIT / GENERAL
- (not currently shown on the one-pager; add to index.html intro if you want one)

KEY PROJECT COVERS — in `index.html` and the project pages
- AT&T Agentic cover  →  search:  267d0a_8508a8721a6e4fa7808d018369f7ba5af002.jpg
- CenterPoint cover   →  search:  267d0a_4cdf613b37764bbf8d0f0bc6fcac5763~mv2.png
- AT&T Fraud cover    →  search:  267d0a_01fe3a37d38d41088d74d6b8056dd1cc~mv2.png

AT&T FRAUD SCREENS — in `project-att-fraud.html`
- Best Match List     →  267d0a_f0381135ff5541b3a96dd5e4d590e158~mv2.png
- Case Overview       →  267d0a_a0acb1e8ce034bf89fd91d292e3adb94~mv2.png
- Investigation View  →  267d0a_ab54366042734a9e989b7c05974c3266~mv2.png
- Case Submission     →  267d0a_08feac2f906a4286b4e28b9bc32e5b3a~mv2.png
- Workflow Editor     →  267d0a_a75e34477a1449568c74184a3904460d~mv2.png
- Page Editor         →  267d0a_c395e85a7d26400ba7103af76b4fd6b4~mv2.png

## How to swap one image
1. Put your file here, e.g.  assets/att-agentic-cover.jpg
2. In the HTML file, replace the long https://static.wixstatic.com/... URL
   with  assets/att-agentic-cover.jpg

## Placeholder galleries
The AT&T Agentic and CenterPoint project pages use green placeholder graphics for
their screen galleries (I only had the cover images for those two). Replace each
`<div class="shot">…</div>` block with:
  <div class="shot"><img src="assets/your-screen.png" alt="Caption" />
    <div class="shot__cap">Caption</div></div>
