-- Starts every chapter of a reader PDF on a new page (#53).
--
-- The chapter level is the highest heading level in the document. When that
-- level occurs only once (a title, such as a single `#` above `##` chapters),
-- the next level is used instead. \clearpage on a page that is already empty
-- does nothing, so the page break after the table of contents or a manual
-- \clearpage in the source gives no blank page.

local function chapter_level(blocks)
  local counts = {}
  for _, block in ipairs(blocks) do
    if block.t == "Header" then
      counts[block.level] = (counts[block.level] or 0) + 1
    end
  end
  local levels = {}
  for level in pairs(counts) do
    table.insert(levels, level)
  end
  table.sort(levels)
  if #levels == 0 then return nil end
  if counts[levels[1]] == 1 and levels[2] then return levels[2] end
  return levels[1]
end

function Pandoc(doc)
  if not FORMAT:match("latex") then return nil end
  local level = chapter_level(doc.blocks)
  if not level then return nil end
  local blocks = {}
  for _, block in ipairs(doc.blocks) do
    if block.t == "Header" and block.level == level then
      table.insert(blocks, pandoc.RawBlock("latex", "\\clearpage"))
    end
    table.insert(blocks, block)
  end
  doc.blocks = blocks
  return doc
end
