-- include-filter.lua
-- Vervangt een losse {@include: [linktekst](relatief/pad.md)}-regel door de
-- geparseerde Markdown uit het genoemde bestand. De directive-inhoud moet
-- een Markdown-link zijn, zodat de include-target in gewone Markdown/VS Code
-- klikbaar en herkenbaar blijft (issue #26). Een {@include: relatief/pad.md}
-- zonder linksyntax geeft een fout.
--
-- Paden zijn relatief aan het Markdown-bronbestand dat Pandoc verwerkt.
-- Gebruik: pandoc bron.md --lua-filter=include-filter.lua ...

local active_includes = {}

local function read_file(file_path)
  local file, open_error = io.open(file_path, "r")
  if not file then
    error("include-filter: kan bestand niet lezen: " .. file_path .. " (" .. open_error .. ")")
  end

  local content = file:read("*a")
  file:close()
  return content
end

local function include_path_from(block)
  if block.t ~= "Para" and block.t ~= "Plain" then
    return nil
  end

  local plain = pandoc.utils.stringify(block)
  if not plain:match("^%{@include:%s*.-%s*%}$") then
    return nil
  end

  -- pandoc.utils.stringify() keeps the link's visible text but drops its
  -- target, so the target is read directly from the parsed Link inline.
  for _, inline in ipairs(block.content) do
    if inline.t == "Link" then
      return inline.target
    end
  end

  error(
    "include-filter: {@include: ...} vereist Markdown-linksyntax, bijv. "
      .. '{@include: [linktekst](pad.md)}. Gevonden: "' .. plain .. '"'
  )
end

local function expand_blocks(blocks, base_dir)
  local expanded = pandoc.List()

  for _, block in ipairs(blocks) do
    local relative_path = include_path_from(block)
    if not relative_path then
      expanded:insert(block)
    else
      local include_path = pandoc.path.normalize(pandoc.path.join({ base_dir, relative_path }))
      if active_includes[include_path] then
        error("include-filter: cyclische include gevonden: " .. include_path)
      end

      active_includes[include_path] = true
      local included = pandoc.read(read_file(include_path), "markdown")
      local included_blocks = expand_blocks(included.blocks, pandoc.path.directory(include_path))
      active_includes[include_path] = nil
      expanded:extend(included_blocks)
    end
  end

  return expanded
end

function Pandoc(document)
  local input_file = PANDOC_STATE.input_files[1]
  if not input_file or input_file == "-" then
    error("include-filter: een Markdown-bronbestand is vereist voor relatieve includes")
  end

  document.blocks = expand_blocks(document.blocks, pandoc.path.directory(input_file))
  return document
end
