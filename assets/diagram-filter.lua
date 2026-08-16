-- diagram-filter.lua
-- Pandoc Lua-filter dat plantuml/mermaid codeblokken rendert via Kroki.
-- Gebruik: pandoc ... --lua-filter=diagram-filter.lua
-- Vereist: curl (voor Kroki API-aanroep)
--
-- Ondersteunde talen: plantuml, mermaid, puml

local supported = { plantuml = true, mermaid = true, puml = true }

-- Kroki base URL (publieke instantie)
local KROKI_URL = os.getenv("KROKI_URL") or "https://kroki.io"

--- Encode diagram-tekst als URL-safe base64 via deflate.
--- Kroki accepteert GET met gecomprimeerde base64 of POST met platte tekst.
--- We gebruiken POST (eenvoudiger, geen compressie nodig).
local function render_via_kroki(diagram_type, diagram_text, output_format)
  output_format = output_format or "svg"
  -- Normaliseer type
  local kroki_type = diagram_type
  if kroki_type == "puml" then kroki_type = "plantuml" end

  -- Schrijf diagram naar tijdelijk bestand
  local tmpfile = os.tmpname()
  local f = io.open(tmpfile, "w")
  if not f then
    io.stderr:write("diagram-filter: kan tijdelijk bestand niet aanmaken\n")
    return nil
  end
  f:write(diagram_text)
  f:close()

  -- Roep Kroki aan via curl POST
  local outfile = os.tmpname() .. "." .. output_format
  local cmd = string.format(
    'curl -s -X POST -H "Content-Type: text/plain" --data-binary @%s -o %s "%s/%s/%s"',
    tmpfile, outfile, KROKI_URL, kroki_type, output_format
  )

  local ok = os.execute(cmd)
  os.remove(tmpfile)

  if not ok then
    io.stderr:write("diagram-filter: Kroki-aanroep mislukt voor " .. kroki_type .. "\n")
    return nil
  end

  -- Lees resultaat
  local result_file = io.open(outfile, "rb")
  if not result_file then
    io.stderr:write("diagram-filter: kan resultaat niet lezen\n")
    return nil
  end
  local data = result_file:read("*a")
  result_file:close()
  os.remove(outfile)

  -- Valideer PNG-header (bytes 1-4: \x89PNG) om corrupte/lege response te detecteren
  if output_format == "png" and (not data or #data < 8 or data:sub(1, 4) ~= "\137PNG") then
    io.stderr:write("diagram-filter: Kroki gaf geen geldige PNG terug (geen netwerk of fout?)\n")
    return nil
  end

  return data, outfile
end

function CodeBlock(block)
  -- Check of het een ondersteund diagram-type is
  local lang = block.classes[1]
  if not lang or not supported[lang] then
    return nil -- laat ongewijzigd
  end

  local diagram_text = block.text
  if not diagram_text or diagram_text == "" then
    return nil
  end

  -- Render als PNG (voor PDF-compatibiliteit)
  local img_data, _ = render_via_kroki(lang, diagram_text, "png")
  if not img_data then
    -- Fallback: toon als codeblok
    io.stderr:write("diagram-filter: fallback naar codeblok voor " .. lang .. "\n")
    return nil
  end

  -- Schrijf PNG naar tijdelijk bestand
  local img_path = os.tmpname() .. ".png"
  local img_file = io.open(img_path, "wb")
  if not img_file then return nil end
  img_file:write(img_data)
  img_file:close()

  -- Maak een pandoc Image-element
  local caption = block.attributes["caption"] or ""
  local img = pandoc.Image(caption, img_path)
  local para = pandoc.Para({ img })

  return para
end
