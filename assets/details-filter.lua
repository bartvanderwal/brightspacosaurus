-- Expands <details> blocks for print (#111).
--
-- A PDF cannot collapse content, so the "how" that sits in a <details> block
-- online is shown in full. The <details> tags disappear and the <summary> text
-- becomes a bold line above the content. Only for LaTeX output; HTML keeps the
-- collapsible block.

local function is_tag(block, tag, closing)
  if block.t ~= "RawBlock" or block.format ~= "html" then return false end
  local slash = closing and "/" or ""
  return block.text:match("^%s*<" .. slash .. tag .. "[%s>]") ~= nil
    and block.text:match(">%s*$") ~= nil
end

local function is_inline_summary(block)
  if block.t ~= "Plain" and block.t ~= "Para" then return false end
  local first, last = block.content[1], block.content[#block.content]
  return first ~= nil and last ~= nil
    and first.t == "RawInline" and first.text:match("^<summary") ~= nil
    and last.t == "RawInline" and last.text == "</summary>"
end

function Blocks(blocks)
  if not FORMAT:match("latex") then return nil end
  local out = pandoc.List()
  local i = 1
  while i <= #blocks do
    local block = blocks[i]
    if is_tag(block, "details", false) or is_tag(block, "details", true) then
      i = i + 1
    elseif is_inline_summary(block) then
      local inlines = pandoc.List(block.content)
      inlines:remove(1)
      inlines:remove(#inlines)
      out:insert(pandoc.Para({ pandoc.Strong(inlines) }))
      i = i + 1
    elseif is_tag(block, "summary", false) then
      local inlines = pandoc.List()
      local j = i + 1
      while j <= #blocks and not is_tag(blocks[j], "summary", true) do
        if blocks[j].content and (blocks[j].t == "Plain" or blocks[j].t == "Para") then
          inlines:extend(blocks[j].content)
        end
        j = j + 1
      end
      out:insert(pandoc.Para({ pandoc.Strong(inlines) }))
      i = j + 1
    else
      out:insert(block)
      i = i + 1
    end
  end
  return out
end
