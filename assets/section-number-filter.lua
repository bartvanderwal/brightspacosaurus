-- Numbers the chapters and sections of a reader PDF (1, 1.1, 1.1.1).
--
-- A single top-level heading is a title, not a chapter (for example `#` above
-- `##` chapters). It is already on the cover, so it is dropped from the body
-- when it repeats the cover title; otherwise it stays as an unnumbered
-- heading. All other headings move up one level, so the chapters get the
-- numbers 1, 2, ... instead of 0.1, 0.2, ...

local function text_of(inlines)
  return pandoc.utils.stringify(inlines)
end

local function single_title_level(blocks)
  local top, count = nil, 0
  for _, block in ipairs(blocks) do
    if block.t == "Header" and (top == nil or block.level < top) then
      top, count = block.level, 0
    end
    if block.t == "Header" and block.level == top then count = count + 1 end
  end
  if top and count == 1 then return top end
  return nil
end

function Pandoc(doc)
  if not FORMAT:match("latex") then return nil end
  local title_level = single_title_level(doc.blocks)
  local cover_title = doc.meta.title and text_of(doc.meta.title) or nil
  local blocks = {}
  for _, block in ipairs(doc.blocks) do
    if block.t == "Header" and title_level and block.level == title_level then
      if text_of(block.content) ~= cover_title then
        block.classes:insert("unnumbered")
        block.classes:insert("unlisted")
        table.insert(blocks, block)
      end
    else
      if block.t == "Header" and title_level and block.level > title_level then
        block.level = block.level - title_level
      end
      table.insert(blocks, block)
    end
  end
  doc.blocks = blocks
  return doc
end
