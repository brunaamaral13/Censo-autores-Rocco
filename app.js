(function () {
  "use strict";

  const REF = { y: 2026, m: 11, d: 1 };
  const CSV_NAME = "Censo_Autores_Rocco_Atualizado_Expandido_48.csv";
  const PAGE = 20;
  const REGIONS = ["Norte", "Nordeste", "Centro-Oeste", "Sudeste", "Sul"];
  const intFmt = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
  const pctFmt = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const UF_REGION = {
    AC: "Norte", AP: "Norte", AM: "Norte", PA: "Norte", RO: "Norte", RR: "Norte", TO: "Norte",
    AL: "Nordeste", BA: "Nordeste", CE: "Nordeste", MA: "Nordeste", PB: "Nordeste", PE: "Nordeste", PI: "Nordeste", RN: "Nordeste", SE: "Nordeste",
    DF: "Centro-Oeste", GO: "Centro-Oeste", MT: "Centro-Oeste", MS: "Centro-Oeste",
    ES: "Sudeste", MG: "Sudeste", RJ: "Sudeste", SP: "Sudeste",
    PR: "Sul", RS: "Sul", SC: "Sul"
  };
  const STATE_NAME = {
    acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
    "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
    "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
    paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
    "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
    "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO"
  };
  const CITY_UF = {
    belem: "PA",
    "bernardino de campos": "SP",
    "boa vista": "RR",
    brasilia: "DF",
    "campina grande": "PB",
    "cruz alta": "RS",
    curitiba: "PR",
    fortaleza: "CE",
    goiania: "GO",
    ipueiras: "CE",
    maranguape: "CE",
    natal: "RN",
    niteroi: "RJ",
    "ouro preto": "MG",
    pirenopolis: "GO",
    "porto alegre": "RS",
    recife: "PE",
    "rio de janeiro": "RJ",
    "rio grande": "RS",
    salvador: "BA",
    santos: "SP",
    "sao goncalo": "RJ",
    "sao jose de espinharas": "PB",
    "sao jose do rio preto": "SP",
    "sao leopoldo": "RS",
    "sao paulo": "SP",
    marilia: "SP",
    "paraguacu paulista": "SP",
    umuarama: "PR",
    cascadura: "RJ",
    araguari: "MG",
    "belo horizonte": "MG",
    caratinga: "MG",
    formiga: "MG"
  };

  const ui = {
    abcScope: "todos",
    abcShow: "head",
    abcQuery: "",
    tableQuery: "",
    tableSort: "vendas",
    tableDir: "desc",
    tablePage: 1,
    uf: null,
    geoClarice: "com",
    originTop: null,
    world: null
  };
  let model = null;

  const dash = document.getElementById("dash");
  const drop = document.getElementById("drop");
  const fileName = document.getElementById("fileName");
  const dropHint = document.getElementById("dropHint");
  const tip = document.getElementById("tip");
  const fileInput = document.getElementById("fileInput");

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function fold(s) {
    return String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
  function pct(n) {
    const value = (n || 0) * 100;
    if (n > 0 && value < 0.05) return "<0,1%";
    return pctFmt.format(value) + "%";
  }
  function num(n) { return intFmt.format(Math.round(n || 0)); }
  function noun(n, one, many) {
    const v = Math.round(n || 0);
    return num(v) + " " + (v === 1 ? one : many);
  }
  function share(n, d) { return d ? n / d : 0; }
  function oneLine(s) { return String(s ?? "").replace(/\s+/g, " ").trim(); }

  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
    const headerLine = text.split(/\r?\n/, 1)[0];
    const commas = (headerLine.match(/,/g) || []).length;
    const semis = (headerLine.match(/;/g) || []).length;
    const delim = semis > commas ? ";" : ",";
    const rows = [];
    let row = [];
    let cur = "";
    let q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else q = false;
        } else cur += ch;
      } else if (ch === '"') q = true;
      else if (ch === delim) { row.push(cur); cur = ""; }
      else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
      else if (ch !== "\r") cur += ch;
    }
    if (cur.length || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ""));
  }

  function columnId(header) {
    const n = fold(header).toLowerCase();
    if (n.includes("isbn")) return "isbn";
    if (n.includes("venda") || n.includes("volume")) return "vendas";
    if (n.includes("titulo")) return "titulo";
    if (n.includes("autor")) return "autor";
    if (n.includes("cidade")) return "cidade";
    if (n.includes("pais")) return "pais";
    if (n.includes("regiao")) return "regiao";
    if (n.includes("falec")) return "falecimento";
    if (n.includes("nasc")) return "nascimento";
    if (n.includes("sexo") || n.includes("genero")) return "sexo";
    return null;
  }

  function parseSales(v) {
    const s = String(v ?? "").trim();
    if (!s) return 0;
    const n = Number(s.replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  function parseDate(v) {
    const text = String(v ?? "").trim();
    if (!text) return null;
    const m = text.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (m) {
      const d = +m[1];
      const month = +m[2];
      return { d, m: month, y: +m[3], yearOnly: d === 1 && month === 1 };
    }
    const y = text.match(/(\d{4})/);
    if (!y) return null;
    const year = +y[1];
    if (year < 1800 || year > REF.y) return null;
    return { d: 1, m: 1, y: year, yearOnly: true };
  }

  function yearsOld(birth) {
    if (!birth) return null;
    if (birth.y < 1 || birth.y > REF.y) return null;
    let age = REF.y - birth.y;
    if (!birth.yearOnly && (REF.m < birth.m || (REF.m === birth.m && REF.d < birth.d))) age -= 1;
    if (age < 0) return null;
    return age;
  }

  function birthLabel(raw) {
    const text = String(raw ?? "").trim();
    const m = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m && +m[1] === 1 && +m[2] === 1) return m[3];
    return text;
  }

  function bandOf(age) {
    if (age == null) return "sem";
    if (age < 30) return "lt30";
    if (age <= 40) return "a30";
    if (age <= 50) return "a40";
    return "a50";
  }

  function genderOf(v) {
    const n = fold(v).toLowerCase().trim();
    if (!n) return "outros";
    if (n.includes("trans") || n.includes("nao bin") || n.includes("nao-bin")) return "trans";
    if (n === "feminino" || n === "mulher") return "feminino";
    if (n === "masculino" || n === "homem") return "masculino";
    return "outros";
  }

  function authorKey(name) {
    let s = fold(name).toUpperCase().replace(/[^A-Z0-9, ]/g, " ").replace(/\s+/g, " ").trim();
    if (!s) return "";
    if (s.includes(",")) {
      const i = s.indexOf(",");
      s = (s.slice(i + 1) + " " + s.slice(0, i)).replace(/\s+/g, " ").trim();
    }
    while (/\b([A-Z])\s+(?=[A-Z]\b)/.test(s)) s = s.replace(/\b([A-Z])\s+(?=[A-Z]\b)/g, "$1");
    const stop = new Set(["DE", "DA", "DO", "DOS", "DAS", "E", "THE"]);
    return [...new Set(s.split(" ").filter((p) => p && !stop.has(p)))].sort().join(" ");
  }

  function canonRegion(v) {
    const n = fold(v).toLowerCase().trim();
    if (n.startsWith("sudeste")) return "Sudeste";
    if (n === "sul") return "Sul";
    if (n.includes("centro")) return "Centro-Oeste";
    if (n.startsWith("nordeste")) return "Nordeste";
    if (n === "norte" || n.startsWith("norte ")) return "Norte";
    if (n.startsWith("internac")) return "Internacional";
    return String(v || "").trim() || "Não informada";
  }

  function ufFromCity(city) {
    const raw = fold(city).toLowerCase().trim();
    if (!raw) return null;
    if (CITY_UF[raw]) return CITY_UF[raw];
    const parts = raw.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) {
      const state = parts[parts.length - 1];
      if (STATE_NAME[state]) return STATE_NAME[state];
    }
    const cityOnly = parts[0] || raw;
    return CITY_UF[cityOnly] || null;
  }

  function addVote(map, key, sales) {
    if (!key) return;
    const cur = map.get(key) || { n: 0, sales: 0 };
    cur.n += 1;
    cur.sales += sales;
    map.set(key, cur);
  }
  function winner(map) {
    let bestK = null;
    let best = null;
    for (const [k, v] of map) {
      if (!best || v.sales > best.sales || (v.sales === best.sales && v.n > best.n)) {
        best = v;
        bestK = k;
      }
    }
    return bestK;
  }
  function chooseName(map) {
    let best = "Sem nome";
    let score = null;
    for (const [name, v] of map) {
      const pretty = name === name.toUpperCase() ? 0 : 1;
      const sc = [v.n, pretty, name.length];
      const better = !score || sc[0] > score[0] || (sc[0] === score[0] && (sc[1] > score[1] || (sc[1] === score[1] && sc[2] > score[2])));
      if (better) { score = sc; best = name; }
    }
    return best;
  }

  function build(text) {
    const table = parseCsv(text);
    if (table.length < 2) throw new Error("O CSV não tem linhas de dados.");
    const headers = table[0].map((label, index) => ({ label: label.trim(), id: columnId(label), index }));
    const needed = ["isbn", "vendas", "titulo", "autor", "cidade", "pais", "regiao", "nascimento", "falecimento", "sexo"];
    const missing = needed.filter((id) => !headers.some((h) => h.id === id));
    if (missing.length) throw new Error("Faltam colunas no CSV: " + missing.join(", ") + ".");

    const rows = [];
    for (let r = 1; r < table.length; r++) {
      const cells = table[r];
      const get = (id) => {
        const h = headers.find((x) => x.id === id);
        return h ? (cells[h.index] ?? "") : "";
      };
      const paisRaw = String(get("pais")).trim();
      const paisKey = fold(paisRaw).toLowerCase();
      const ufNomeada = STATE_NAME[paisKey] || null;
      let cidade = String(get("cidade")).trim();
      let pais = paisRaw;
      let regiao = canonRegion(get("regiao"));
      let uf = null;
      const brasil = paisKey === "brasil" || Boolean(ufNomeada);
      if (brasil) {
        pais = "Brasil";
        if (ufNomeada && cidade && !fold(cidade).toLowerCase().includes(paisKey)) cidade = cidade + ", " + paisRaw;
        uf = ufNomeada || ufFromCity(cidade);
        if (!REGIONS.includes(regiao) && uf) regiao = UF_REGION[uf];
      }
      const vendas = parseSales(get("vendas"));
      const birth = parseDate(get("nascimento"));
      const death = parseDate(get("falecimento"));
      const age = yearsOld(birth);
      rows.push({
        isbn: String(get("isbn")).trim(),
        vendas,
        titulo: String(get("titulo")),
        autor: String(get("autor")).trim(),
        cidade,
        pais,
        regiao,
        nascimento: String(get("nascimento")).trim(),
        falecimento: String(get("falecimento")).trim(),
        sexo: String(get("sexo")).trim(),
        brasil,
        uf,
        gender: genderOf(get("sexo")),
        dead: Boolean(death) || String(get("falecimento")).trim() !== "",
        age,
        band: bandOf(age),
        key: authorKey(get("autor"))
      });
    }

    const authors = new Map();
    rows.forEach((row) => {
      const key = row.key || "(sem nome)";
      let a = authors.get(key);
      if (!a) {
        a = {
          key,
          sales: 0,
          salesBr: 0,
          titles: 0,
          names: new Map(),
          countries: new Map(),
          genders: new Map(),
          regions: new Map(),
          salesByRegion: {},
          trans: false,
          dead: false,
          birth: null,
          birthSales: -1
        };
        authors.set(key, a);
      }
      a.sales += row.vendas;
      a.titles += 1;
      addVote(a.names, row.autor || "Sem nome", row.vendas);
      addVote(a.countries, row.pais || "Não informado", row.vendas);
      addVote(a.genders, row.gender, row.vendas);
      if (row.gender === "trans") a.trans = true;
      if (row.dead) a.dead = true;
      if (row.age != null && row.vendas >= a.birthSales) {
        a.birth = { age: row.age, band: row.band };
        a.birthSales = row.vendas;
      } else if (!a.birth && row.age != null) {
        a.birth = { age: row.age, band: row.band };
        a.birthSales = row.vendas;
      }
      if (row.brasil) {
        a.salesBr += row.vendas;
        addVote(a.regions, row.regiao, row.vendas);
        if (REGIONS.includes(row.regiao)) {
          a.salesByRegion[row.regiao] = (a.salesByRegion[row.regiao] || 0) + row.vendas;
        }
      }
    });

    const authorList = [];
    authors.forEach((a) => {
      a.name = chooseName(a.names);
      a.pais = winner(a.countries) || "Não informado";
      a.nacional = fold(a.pais).toLowerCase() === "brasil";
      a.gender = a.trans ? "trans" : (winner(a.genders) || "outros");
      a.alive = !a.dead;
      a.band = a.birth ? a.birth.band : "sem";
      a.age = a.birth ? a.birth.age : null;
      a.homeRegion = winner(a.regions);
      authorList.push(a);
    });

    const places = aggregateUfs(rows, (row) => authors.get(row.key || "(sem nome)").name);

    const sales = rows.reduce((s, r) => s + r.vendas, 0);
    const nationalSales = rows.reduce((s, r) => s + (r.brasil ? r.vendas : 0), 0);
    const countries = new Set(rows.map((r) => r.pais).filter(Boolean));

    return {
      headers: headers.filter((h) => h.id),
      rows,
      authors: authorList,
      sales,
      nationalSales,
      countries: countries.size,
      ufs: places.ufs,
      unmapped: places.unmapped
    };
  }

  function groupStats(list, pick, order) {
    const buckets = new Map();
    order.forEach((item) => buckets.set(item.id, { ...item, authors: 0, sales: 0 }));
    list.forEach((a) => {
      const id = pick(a);
      if (!buckets.has(id)) buckets.set(id, { id, label: id, color: "#8a8178", authors: 0, sales: 0 });
      const b = buckets.get(id);
      b.authors += 1;
      b.sales += a.sales;
    });
    const authorTotal = list.length;
    const salesTotal = list.reduce((s, a) => s + a.sales, 0);
    return [...buckets.values()].map((b) => ({
      ...b,
      authorShare: share(b.authors, authorTotal),
      salesShare: share(b.sales, salesTotal)
    }));
  }

  function stack(parts, key) {
    return `<div class="stack">${parts.map((p) => `<span style="flex:${Math.max(p[key], 0)} ${Math.max(p[key], 0)} 0;background:${p.color}"></span>`).join("")}</div>`;
  }

  function splitRing(a, b) {
    const r = 54;
    const c = 2 * Math.PI * r;
    const gap = 22;
    const arcs = [a, b].map((p, i) => {
      const len = Math.max(p.authorShare * c - gap, 0);
      const start = (i === 0 ? 0.75 : 0.75 + a.authorShare) * c;
      return `<circle cx="70" cy="70" r="${r}" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-start}" style="stroke:${p.color}"></circle>`;
    }).join("");
    return `<div class="poster-ring">
      <svg viewBox="0 0 140 140" role="img" aria-label="Participação de autores nacionais e internacionais">
        <g transform="rotate(-90 70 70)">${arcs}</g>
      </svg>
    </div>`;
  }

  function originTop(nacional) {
    return model.authors
      .filter((a) => a.nacional === nacional && a.sales > 0)
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"))
      .slice(0, 5);
  }

  function originRankHtml(id) {
    if (!id) return "";
    const nacional = id === "nacional";
    const top = originTop(nacional);
    const rows = top.length
      ? `<ol>${top.map((a, i) => `<li><span>${i + 1}</span><span>${esc(a.name)}</span><b>${num(a.sales)}</b></li>`).join("")}</ol>`
      : `<p class="note">Sem venda nesta categoria.</p>`;
    return `<p class="kicker">Top 5 · ${nacional ? "Nacionais" : "Internacionais"}</p>${rows}`;
  }

  function posterSide(part, id, right) {
    const on = ui.originTop === id;
    return `<button type="button" class="poster-side${right ? " right" : ""}${on ? " is-on" : ""}" data-origin="${id}" aria-pressed="${on}" style="color:${part.color}">
        <div class="poster-fig"><strong>${pct(part.authorShare)}</strong></div>
        <p class="poster-label">${esc(part.label)}</p>
        <p class="poster-sub">${noun(part.authors, "autor", "autores")}</p>
      </button>`;
  }

  function poster(a, b) {
    return `<div class="poster">
      ${posterSide(a, "nacional", false)}
      ${splitRing(a, b)}
      ${posterSide(b, "internacional", true)}
    </div>
    <div class="origin-top" id="originTop"${ui.originTop ? "" : " hidden"}>${originRankHtml(ui.originTop)}</div>
    <div class="sales-block">
      <p class="sales-label">Share de vendas</p>
      ${stack([a, b], "salesShare")}
      <div class="sales-caps">
        <span><b>${pct(a.salesShare)}</b> · ${num(a.sales)} exemplares vendidos</span>
        <span><b>${pct(b.salesShare)}</b> · ${num(b.sales)} exemplares vendidos</span>
      </div>
    </div>`;
  }

  function genderMark(id) {
    const pen = 'fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';
    if (id === "feminino") {
      return `<svg class="gender-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="20" r="12" ${pen}></circle><path d="M32 32v22M22 44h20" ${pen}></path></svg>`;
    }
    if (id === "masculino") {
      return `<svg class="gender-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="24" cy="40" r="12" ${pen}></circle><path d="M33 31L50 14M36 14h14v14" ${pen}></path></svg>`;
    }
    if (id === "trans") {
      return `<svg class="gender-mark" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="14" ${pen}></circle></svg>`;
    }
    return "";
  }

  function genderTop(id) {
    return model.authors
      .filter((a) => a.gender === id && a.sales > 0)
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"))
      .slice(0, 5);
  }

  function statCols(parts) {
    return `<div class="cols">${parts.map((p) => `<div class="col" data-gender="${p.id}" data-label="${esc(p.label)}" style="border-color:${p.color};color:${p.color}">
      ${genderMark(p.id)}
      <strong class="big">${pct(p.authorShare)}</strong>
      <div>${esc(p.label)}</div>
      <small>${noun(p.authors, "autor", "autores")}</small>
      <div class="sales-block">
        <p class="sales-label">Share de vendas</p>
        <div class="track"><span style="width:${Math.max(p.salesShare * 100, p.sales ? 2 : 0)}%;background:${p.color}"></span></div>
        <small>${pct(p.salesShare)} · ${num(p.sales)} exemplares vendidos</small>
      </div>
    </div>`).join("")}</div>`;
  }

  function heat(sales, max) {
    if (!sales || !max) return "var(--empty)";
    const t = 0.32 + 0.68 * Math.sqrt(sales / max);
    const a = [246, 210, 206];
    const b = [177, 18, 24];
    const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
    return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  }

  function originParts() {
    return groupStats(model.authors, (a) => a.nacional ? "nacional" : "internacional", [
      { id: "nacional", label: "Nacionais", color: "var(--red)" },
      { id: "internacional", label: "Internacionais", color: "var(--navy)" }
    ]);
  }
  function genderParts() {
    const order = [
      { id: "feminino", label: "Feminino", color: "var(--red)" },
      { id: "masculino", label: "Masculino", color: "var(--navy)" },
      { id: "trans", label: "Outros", color: "var(--amber)" }
    ];
    const parts = groupStats(model.authors, (a) => a.gender, order);
    return parts.filter((p) => p.id !== "outros");
  }
  function lifeParts() {
    return groupStats(model.authors, (a) => a.alive ? "vivo" : "morto", [
      { id: "vivo", label: "Vivos", color: "#7ee0ff" },
      { id: "morto", label: "Falecidos", color: "#ff4d57" }
    ]);
  }
  function ageParts() {
    return groupStats(model.authors, (a) => a.band, [
      { id: "lt30", label: "Menores de 30" },
      { id: "a30", label: "De 30 a 40" },
      { id: "a40", label: "De 40 a 50" },
      { id: "a50", label: "Acima de 50" },
      { id: "sem", label: "Sem data" }
    ]).filter((p) => p.id !== "sem" || p.authors > 0);
  }

  function aggregateUfs(rows, nameOf) {
    const ufs = {};
    Object.keys(UF_REGION).forEach((sigla) => {
      ufs[sigla] = { sales: 0, titles: 0, keys: new Set(), top: new Map() };
    });
    const unmapped = new Map();
    rows.forEach((row) => {
      if (!row.brasil) return;
      if (!row.uf || !ufs[row.uf]) {
        unmapped.set(row.cidade || "(em branco)", (unmapped.get(row.cidade || "(em branco)") || 0) + 1);
        return;
      }
      const slot = ufs[row.uf];
      slot.sales += row.vendas;
      slot.titles += 1;
      slot.keys.add(row.key || "(sem nome)");
      const name = nameOf(row);
      const cur = slot.top.get(name) || 0;
      slot.top.set(name, cur + row.vendas);
    });
    Object.values(ufs).forEach((slot) => {
      slot.authors = slot.keys.size;
      slot.ranking = [...slot.top.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "pt")).slice(0, 5);
    });
    return {
      ufs,
      unmapped: [...unmapped.entries()].sort((a, b) => b[1] - a[1])
    };
  }

  function isClarice(key) {
    const parts = String(key || "").split(" ");
    return parts.includes("CLARICE") && parts.includes("LISPECTOR");
  }

  let geoMemo = null;
  function geoView() {
    const mode = ui.geoClarice === "sem" ? "sem" : "com";
    if (geoMemo && geoMemo.mode === mode && geoMemo.model === model) return geoMemo.view;
    let view;
    if (mode === "com") {
      view = {
        rows: model.rows,
        authors: model.authors,
        ufs: model.ufs,
        nationalSales: model.nationalSales,
        unmapped: model.unmapped
      };
    } else {
      const rows = model.rows.filter((r) => !isClarice(r.key));
      const authors = model.authors.filter((a) => !isClarice(a.key));
      const byKey = new Map(authors.map((a) => [a.key, a]));
      const places = aggregateUfs(rows, (row) => {
        const author = byKey.get(row.key || "(sem nome)");
        return author ? author.name : (row.autor || "Sem nome");
      });
      view = {
        rows,
        authors,
        ufs: places.ufs,
        nationalSales: rows.reduce((s, r) => s + (r.brasil ? r.vendas : 0), 0),
        unmapped: places.unmapped
      };
    }
    geoMemo = { mode, model, view };
    return view;
  }

  function regionBlocks() {
    const geo = geoView();
    const nationals = geo.authors.filter((a) => a.nacional);
    const blocks = REGIONS.map((name) => {
      const sales = geo.rows.reduce((s, r) => s + (r.brasil && r.regiao === name ? r.vendas : 0), 0);
      const housed = nationals.filter((a) => a.homeRegion === name);
      const ranking = geo.authors
        .map((a) => ({ name: a.name, sales: a.salesByRegion[name] || 0, nacional: a.nacional }))
        .filter((a) => a.nacional && a.sales > 0)
        .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"))
        .slice(0, 5);
      return {
        name,
        sales,
        salesShare: share(sales, geo.nationalSales),
        authors: housed.length,
        authorShare: share(housed.length, nationals.length),
        ranking
      };
    });
    return blocks;
  }

  function abcPack() {
    let list = model.authors.slice();
    if (ui.abcScope === "nacionais") list = list.filter((a) => a.nacional);
    list.sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"));
    const n = list.length;
    const nHead = n ? Math.max(1, Math.round(n * 0.2)) : 0;
    const total = list.reduce((s, a) => s + a.sales, 0);
    const ranked = list.map((a, i) => ({
      rank: i + 1,
      name: a.name,
      sales: a.sales,
      titles: a.titles,
      pais: a.pais,
      share: share(a.sales, total)
    }));
    const head = ranked.slice(0, nHead);
    const tail = ranked.slice(nHead);
    const headSales = head.reduce((s, a) => s + a.sales, 0);
    const curve = [{ x: 0, y: 0 }];
    let cum = 0;
    list.forEach((a, i) => {
      cum += a.sales;
      curve.push({ x: (i + 1) / n, y: total ? cum / total : 0 });
    });
    return { n, nHead, head, tail, total, headSales, tailSales: total - headSales, curve };
  }

  function sentenceOrigin(parts) {
    const n = parts[0];
    const i = parts[1];
    return `Autores nacionais são ${pct(n.authorShare)} do censo e respondem por ${pct(n.salesShare)} das vendas. Os internacionais são ${pct(i.authorShare)} dos autores e ${pct(i.salesShare)} dos exemplares vendidos.`;
  }
  function sentenceGender(parts) {
    const f = parts.find((p) => p.id === "feminino");
    const lead = parts.slice().sort((a, b) => b.salesShare - a.salesShare)[0];
    return `Autoras são ${pct(f.authorShare)} dos nomes e ${pct(f.salesShare)} das vendas. Quem mais pesa nas vendas é o grupo ${lead.label.toLowerCase()} (${pct(lead.salesShare)}).`;
  }
  function sentenceLife(parts) {
    const vivos = parts.find((p) => p.id === "vivo");
    const mortos = parts.find((p) => p.id === "morto");
    return `Autores vivos são ${pct(vivos.authorShare)} do censo e ${pct(vivos.salesShare)} das vendas. Os falecidos são ${pct(mortos.authorShare)} dos autores e ${pct(mortos.salesShare)} dos exemplares vendidos.`;
  }
  function sentenceAge(parts) {
    const known = parts.filter((p) => p.id !== "sem");
    const byAuthors = known.slice().sort((a, b) => b.authorShare - a.authorShare)[0];
    const bySales = known.slice().sort((a, b) => b.salesShare - a.salesShare)[0];
    if (byAuthors.id === bySales.id) {
      return `A faixa ${byAuthors.label.toLowerCase()} reúne ${pct(byAuthors.authorShare)} dos autores e também a maior parte das vendas (${pct(byAuthors.salesShare)}).`;
    }
    return `A maior parte dos autores está em ${byAuthors.label.toLowerCase()} (${pct(byAuthors.authorShare)}). As vendas se concentram em ${bySales.label.toLowerCase()} (${pct(bySales.salesShare)}).`;
  }

  function donutSvg(parts) {
    const r = 54;
    const c = 2 * Math.PI * r;
    let offset = 0;
    const circles = parts.map((p) => {
      const len = Math.max(p.authorShare, 0) * c;
      const node = `<circle cx="70" cy="70" r="${r}" fill="none" stroke="${p.color}" stroke-width="16" stroke-dasharray="${len} ${c - len}" stroke-dashoffset="${-offset}"></circle>`;
      offset += len;
      return node;
    }).join("");
    const vivos = parts.find((p) => p.id === "vivo");
    return `<div class="donut">
      <svg viewBox="0 0 140 140" role="img" aria-label="Participação de autores vivos e falecidos">
        <g transform="rotate(-90 70 70)">${circles}</g>
      </svg>
      <div class="donut-mid"><strong>${pct(vivos.authorShare)}</strong><span>vivos</span></div>
    </div>`;
  }

  function mapSvg() {
    const map = window.BRAZIL_MAP;
    if (!map) return "<p>Mapa indisponível.</p>";
    const geo = geoView();
    const max = Math.max(...Object.values(geo.ufs).map((u) => u.sales), 0);
    const [x, y, w, h] = map.viewBox;
    const paths = map.states.map((st) => {
      const info = geo.ufs[st.sigla] || { sales: 0, authors: 0 };
      const fill = info.authors ? heat(info.sales, max) : "#1c283c";
      const on = ui.uf === st.sigla ? " is-on" : "";
      return `<path class="uf${on}" data-uf="${st.sigla}" tabindex="0" role="button" aria-label="${esc(st.nome)}" aria-pressed="${ui.uf === st.sigla}" fill="${fill}" d="${st.d}"></path>`;
    }).join("");
    const df = map.states.find((s) => s.sigla === "DF");
    const mark = df ? `<circle class="uf-hit" data-uf="DF" cx="${df.cx}" cy="${df.cy}" r="12"></circle><circle class="df-dot" cx="${df.cx}" cy="${df.cy}" r="3.2"></circle>` : "";
    return `<svg class="brazil" viewBox="${x} ${y} ${w} ${h}" role="img" aria-label="Mapa do Brasil por unidade da federação">${paths}${mark}</svg>`;
  }

  function ufDetailHtml() {
    if (!ui.uf) return "<p>Escolha um estado no mapa para ver autores e vendas.</p>";
    const st = window.BRAZIL_MAP.states.find((s) => s.sigla === ui.uf);
    const geo = geoView();
    const info = geo.ufs[ui.uf];
    if (!info || !info.authors) return `<h3>${esc(st ? st.nome : ui.uf)}</h3><p>Nenhum autor brasileiro deste estado no arquivo.</p>`;
    return `<h3>${esc(st.nome)} · ${st.sigla}</h3>
      <p>${noun(info.authors, "autor", "autores")} · ${noun(info.titles, "título", "títulos")} · ${num(info.sales)} exemplares vendidos · ${pct(share(info.sales, geo.nationalSales))} das vendas nacionais</p>
      <ol>${info.ranking.map(([name, sales]) => `<li><span></span><span>${esc(name)}</span><b>${num(sales)}</b></li>`).join("")}</ol>`;
  }

  function chipsHtml() {
    const map = window.BRAZIL_MAP;
    const geo = geoView();
    return Object.entries(geo.ufs)
      .filter(([, u]) => u.authors > 0)
      .sort((a, b) => b[1].sales - a[1].sales)
      .map(([sigla, u]) => {
        const st = map.states.find((s) => s.sigla === sigla);
        return `<button type="button" class="chip${ui.uf === sigla ? " is-on" : ""}" data-uf="${sigla}" aria-pressed="${ui.uf === sigla}"><b>${sigla}</b>${esc(st.nome)}<small>${noun(u.authors, "autor", "autores")} · ${pct(share(u.sales, geo.nationalSales))} das vendas</small></button>`;
      }).join("");
  }

  function statesWithAuthors() {
    return Object.values(geoView().ufs).filter((u) => u.authors > 0).length;
  }

  function abcChart(pack) {
    const w = 640, h = 280, l = 46, rgt = 12, t = 16, b = 36;
    const iw = w - l - rgt;
    const ih = h - t - b;
    const X = (x) => l + x * iw;
    const Y = (y) => t + (1 - y) * ih;
    const line = pack.curve.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(" ");
    const xHead = pack.n ? pack.nHead / pack.n : 0;
    const yHead = pack.total ? pack.headSales / pack.total : 0;
    return `<svg class="abc-chart" viewBox="0 0 ${w} ${h}" role="img" aria-label="Curva ABC de autores por lifetime volume, sell-out via Nielsen">
      <line x1="${X(0)}" y1="${Y(0)}" x2="${X(1)}" y2="${Y(1)}" stroke="#31445f" stroke-dasharray="4 4"/>
      <polyline points="${line}" fill="none" stroke="#7ee0ff" stroke-width="2.5"/>
      <line x1="${X(xHead)}" y1="${Y(0)}" x2="${X(xHead)}" y2="${Y(yHead)}" stroke="#ff4d57" stroke-width="1.5"/>
      <line x1="${X(0)}" y1="${Y(yHead)}" x2="${X(xHead)}" y2="${Y(yHead)}" stroke="#ff4d57" stroke-width="1.5"/>
      <circle cx="${X(xHead)}" cy="${Y(yHead)}" r="4.5" fill="#ff4d57"/>
      <text x="${X(0)}" y="${h - 12}">0%</text>
      <text x="${X(xHead)}" y="${h - 12}" text-anchor="middle">20%</text>
      <text x="${X(1)}" y="${h - 12}" text-anchor="end">100% dos autores</text>
      <text x="8" y="${Y(1)}">100%</text>
      <text x="8" y="${Y(0)}">0</text>
    </svg>`;
  }

  function abcRowsHtml(pack) {
    const q = fold(ui.abcQuery).toLowerCase().trim();
    const source = ui.abcShow === "head" ? pack.head : pack.tail;
    const rows = source.filter((a) => !q || fold(a.name).toLowerCase().includes(q));
    if (!rows.length) return `<li><span></span><span>Nenhum autor com esse nome neste grupo.</span></li>`;
    return rows.map((a) => `<li>
      <span>${a.rank}</span>
      <span class="who">${esc(a.name)}<small>${esc(a.pais)} · ${noun(a.titles, "título", "títulos")}</small></span>
      <b>${num(a.sales)}</b>
      <b>${pct(a.share)}</b>
    </li>`).join("");
  }

  function panel(id, kicker, title, body, note) {
    return `<section class="panel" id="${id}"><header class="panel-head"><p class="kicker">${kicker}</p><h2>${title}</h2></header>${body}${note ? `<p class="note">${note}</p>` : ""}</section>`;
  }

  function kpisHtml(pack) {
    const headShare = share(pack.headSales, pack.total);
    return `<section class="kpis">
      <div class="kpi"><span>Autores</span><strong>${num(model.authors.length)}</strong><small>nomes únicos no censo</small></div>
      <div class="kpi"><span>Títulos</span><strong>${num(model.rows.length)}</strong><small>linhas do CSV</small></div>
      <div class="kpi"><span>Lifetime volume</span><strong>${num(model.sales)}</strong><small>sell-out (via Nielsen)</small></div>
      <button type="button" class="kpi go" data-jump="panel-abc"><span>Cabeça da curva</span><strong>${pct(headShare)}</strong><small>das vendas estão nos 20% que mais vendem</small></button>
    </section>
    <p class="keyline"><span><i class="swatch navy"></i>participação dos autores</span><span><i class="swatch red"></i>share de sell-out</span><span>${num(model.countries)} países de origem</span></p>`;
  }

  function originHtml() {
    const parts = originParts();
    return panel("panel-origin", "01 · Origem", "Nacionais e internacionais",
      `<p class="insight">${sentenceOrigin(parts)}</p>${poster(parts[0], parts[1])}`);
  }
  function genderHtml() {
    const parts = genderParts();
    const shown = parts.filter((p) => p.id !== "outros");
    return panel("panel-gender", "02 · Gênero", "Feminino, masculino e outros",
      `<p class="insight">${sentenceGender(parts)}</p>${statCols(shown)}`);
  }
  function lifeHtml() {
    const parts = lifeParts();
    const rows = parts.map((p) => `<div class="legend-row"><span><i style="background:${p.color}"></i>${esc(p.label)}</span><span><b>${noun(p.authors, "autor", "autores")}</b> · ${pct(p.authorShare)}</span><span><b>${pct(p.salesShare)}</b> vendas</span></div>`).join("");
    return panel("panel-life", "03 · Vida", "Vivos e falecidos",
      `<p class="insight">${sentenceLife(parts)}</p><div class="life">${donutSvg(parts)}<div>${rows}</div></div>`);
  }
  function ageHtml() {
    const parts = ageParts();
    const bands = parts.map((p) => `<div class="band">
      <div class="band-name">${esc(p.label)}</div>
      <div class="band-pct">${pct(p.authorShare)}</div>
      <div class="twin">
        <div class="track"><span class="navy" style="width:${Math.max(p.authorShare * 100, p.authors ? 1.5 : 0)}%"></span></div>
        <div class="track thin"><span class="red" style="width:${Math.max(p.salesShare * 100, p.sales ? 1.5 : 0)}%"></span></div>
      </div>
      <div class="band-sales">${pct(p.salesShare)}<span>${noun(p.authors, "autor", "autores")}</span></div>
    </div>`).join("");
    return panel("panel-age", "04 · Geração", "Idade em 2026",
      `<p class="insight">${sentenceAge(parts)}</p><div class="band-legend"><span><i class="swatch navy"></i>autores</span><span><i class="swatch red"></i>vendas</span></div><div class="bands">${bands}</div>`);
  }

  function mapHtml() {
    const blocks = regionBlocks();
    const lead = blocks.slice().sort((a, b) => b.salesShare - a.salesShare)[0];
    const withClarice = ui.geoClarice !== "sem";
    const cut = withClarice ? "Com Clarice Lispector, " : "Sem Clarice Lispector, ";
    const regions = blocks.map((b) => `<article class="region">
      <div class="region-top"><h3>${esc(b.name)}</h3><span>${pct(b.authorShare)} dos autores nacionais<br>${pct(b.salesShare)} das vendas nacionais</span></div>
      <div class="twin">
        <div class="track"><span class="navy" style="width:${Math.max(b.authorShare * 100, b.authors ? 1.5 : 0)}%"></span></div>
        <div class="track thin"><span class="red" style="width:${Math.max(b.salesShare * 100, b.sales ? 1.5 : 0)}%"></span></div>
      </div>
      ${b.ranking.length ? `<ol>${b.ranking.map((a, i) => `<li><span>${i + 1}</span><span>${esc(a.name)}</span><b>${num(a.sales)}</b></li>`).join("")}</ol>` : "<p class='note'>Nenhum autor nacional com venda nesta região.</p>"}
    </article>`).join("");
    const unmapped = geoView().unmapped.length ? ` Cidades brasileiras sem UF reconhecida: ${geoView().unmapped.map(([c, n]) => esc(c) + " (" + n + ")").join(", ")}.` : "";
    return panel("panel-map", "05 · Geografia", "Onde estão os autores brasileiros",
      `<div class="scope geo-toggle" role="group" aria-label="Recorte de Clarice Lispector">
        <button type="button" data-clarice="com" class="${withClarice ? "is-on" : ""}" aria-pressed="${withClarice}">Com Clarice Lispector</button>
        <button type="button" data-clarice="sem" class="${withClarice ? "" : "is-on"}" aria-pressed="${!withClarice}">Sem Clarice Lispector</button>
      </div>
      <p class="insight">${cut}${esc(lead.name)} concentra ${pct(lead.authorShare)} dos autores nacionais e ${pct(lead.salesShare)} das vendas nacionais. Há autores em ${statesWithAuthors()} unidades da federação.</p>
      <div class="map-layout">
        <div>
          ${mapSvg()}
          <div class="uf-detail" id="ufDetail">${ufDetailHtml()}</div>
          <div class="map-scale"><span>sem autores</span><i class="scale-bar"></i><span>mais vendas</span></div>
          <div class="chips" id="ufChips">${chipsHtml()}</div>
        </div>
        <div>
          <p class="kicker">06 · Destaques</p>
          <h2 style="font-family:var(--narrow);letter-spacing:-0.04em;font-size:32px;margin:4px 0 10px">Quem mais vende em cada região</h2>
          <div class="regions">${regions}</div>
        </div>
      </div>`,
      "Clarice Lispector foi considerada do Nordeste, onde passou boa parte da vida, mesmo sendo da Ucrânia. Ela tem cidadania brasileira. O mapa pinta o estado quando a cidade de origem é brasileira e reconhecida. O tom segue o lifetime volume, sell-out via Nielsen, daquele estado." + unmapped);
  }

  const CONTINENTS = [
    { id: "norte", name: "América do Norte", short: "América do Norte", label: [-118, 58], rings: [[ [-168, 71], [-165, 54], [-153, 58], [-140, 60], [-130, 55], [-125, 49], [-124, 40], [-117, 32], [-110, 24], [-105, 22], [-97, 16], [-90, 18], [-86, 22], [-82, 28], [-80, 25], [-81, 31], [-75, 35], [-70, 42], [-67, 45], [-56, 53], [-64, 60], [-80, 74], [-105, 75], [-140, 71], [-168, 71] ]] },
    { id: "central", name: "América Central e Caribe", short: "Central", label: [-84, 24], rings: [[ [-92, 17], [-90, 16], [-86, 13], [-83, 9], [-80, 8], [-77, 7], [-80, 10], [-84, 13], [-87, 16], [-92, 17] ], [ [-76, 21], [-68, 20], [-68, 17], [-72, 17], [-76, 19] ]] },
    { id: "sul", name: "América do Sul", short: "América do Sul", label: [-68, -22], rings: [[ [-81, 12], [-77, 8], [-79, 1], [-80, -5], [-76, -15], [-74, -30], [-74, -42], [-72, -52], [-68, -56], [-65, -50], [-62, -40], [-54, -34], [-48, -28], [-40, -22], [-35, -8], [-35, 0], [-48, 2], [-60, 8], [-70, 12], [-81, 12] ]] },
    { id: "europa", name: "Europa", short: "Europa", label: [15, 64], rings: [[ [-11, 36], [-10, 43], [-8, 52], [-6, 59], [-5, 62], [5, 62], [8, 70], [28, 71], [40, 69], [60, 68], [60, 52], [40, 46], [28, 41], [19, 40], [10, 42], [-1, 43], [-9, 37], [-11, 36] ]] },
    { id: "africa", name: "África", short: "África", label: [17, 6], rings: [[ [-17, 15], [-17, 21], [-12, 32], [-6, 36], [10, 37], [25, 32], [33, 31], [43, 12], [51, 12], [44, -1], [42, -16], [35, -26], [32, -34], [19, -35], [15, -28], [12, -17], [9, -1], [8, 5], [-5, 5], [-14, 8], [-17, 15] ]] },
    { id: "asia", name: "Ásia", short: "Ásia", label: [90, 50], rings: [[ [32, 42], [44, 42], [60, 50], [80, 55], [100, 72], [140, 72], [170, 66], [158, 52], [145, 43], [142, 34], [132, 30], [128, 36], [126, 22], [122, 8], [112, 0], [104, -8], [98, 2], [90, 8], [78, 8], [70, 22], [60, 25], [52, 28], [44, 13], [35, 16], [34, 29], [32, 32], [28, 37], [32, 42] ]] },
    { id: "oceania", name: "Oceania", short: "Oceania", label: [134, -22], rings: [[ [113, -21], [128, -14], [137, -12], [143, -11], [146, -16], [153, -26], [150, -38], [140, -39], [128, -33], [115, -35], [113, -26] ], [ [166, -47], [166, -41], [172, -34], [178, -37], [175, -42], [168, -46] ]] }
  ];

  const COUNTRY_GEO = {
    "estados unidos": ["norte", -98, 39],
    "canada": ["norte", -106, 56],
    "mexico": ["norte", -102, 23],
    "panama": ["central", -80.5, 8.5],
    "honduras": ["central", -86.5, 14.8],
    "guatemala": ["central", -90.5, 15.5],
    "republica dominicana": ["central", -70.5, 19],
    "argentina": ["sul", -64, -34],
    "chile": ["sul", -71, -35],
    "equador": ["sul", -78.5, -1.5],
    "peru": ["sul", -75, -10],
    "bolivia": ["sul", -65, -17],
    "reino unido": ["europa", -2, 54],
    "franca": ["europa", 2, 47],
    "italia": ["europa", 12.5, 42.5],
    "irlanda": ["europa", -8, 53.5],
    "espanha": ["europa", -3.7, 40.2],
    "russia": ["europa", 37, 56],
    "suecia": ["europa", 16, 62],
    "alemanha": ["europa", 10.5, 51],
    "romenia": ["europa", 25, 46],
    "polonia": ["europa", 19.5, 52],
    "paises baixos": ["europa", 5.3, 52.2],
    "bosnia e herzegovina": ["europa", 17.8, 44],
    "dinamarca": ["europa", 10, 56],
    "grecia": ["europa", 22, 39],
    "portugal": ["europa", -8, 39.5],
    "austria": ["europa", 14.5, 47.5],
    "ucrania": ["europa", 31, 49],
    "noruega": ["europa", 9, 62],
    "belgica": ["europa", 4.4, 50.5],
    "suica": ["europa", 8.2, 46.8],
    "china": ["asia", 104, 35],
    "india": ["asia", 79, 22],
    "israel": ["asia", 35, 31.5],
    "coreia do sul": ["asia", 128, 36.5],
    "filipinas": ["asia", 122, 12],
    "ira": ["asia", 53, 32],
    "vietna": ["asia", 108, 16],
    "malasia": ["asia", 102, 4],
    "japao": ["asia", 138, 36],
    "bangladesh": ["asia", 90, 24],
    "turquia": ["asia", 35, 39],
    "nigeria": ["africa", 8, 10],
    "malawi": ["africa", 34, -13],
    "egito": ["africa", 30, 27],
    "gana": ["africa", -1.2, 8],
    "africa do sul": ["africa", 25, -29],
    "marrocos": ["africa", -6, 32],
    "mocambique": ["africa", 35, -18],
    "zimbabue": ["africa", 29.5, -19],
    "argelia": ["africa", 3, 28],
    "sudao do sul": ["africa", 30, 7],
    "etiopia": ["africa", 40, 9],
    "australia": ["oceania", 134, -25],
    "nova zelandia": ["oceania", 174, -41],
    "polinesia francesa": ["oceania", -149.5, -17.5]
  };

  function projectWorld(lon, lat) {
    return [(lon + 180) / 360 * 960, (90 - lat) / 180 * 480];
  }

  function worldRing(ring) {
    return ring.map((p, i) => {
      const [x, y] = projectWorld(p[0], p[1]);
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join("") + "Z";
  }

  function worldPack() {
    const intl = model.authors.filter((a) => !a.nacional);
    const intlSales = intl.reduce((s, a) => s + a.sales, 0);
    const byCountry = new Map();
    const unknown = new Map();
    intl.forEach((a) => {
      const key = fold(a.pais).toLowerCase();
      const geo = COUNTRY_GEO[key];
      if (!geo) {
        unknown.set(a.pais || "Não informado", (unknown.get(a.pais || "Não informado") || 0) + 1);
        return;
      }
      let slot = byCountry.get(key);
      if (!slot) {
        slot = { key, name: a.pais, continent: geo[0], lon: geo[1], lat: geo[2], authors: 0, sales: 0, titles: 0, people: [] };
        byCountry.set(key, slot);
      }
      slot.authors += 1;
      slot.sales += a.sales;
      slot.titles += a.titles;
      slot.people.push(a);
    });
    const countries = [...byCountry.values()].sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"));
    const continents = CONTINENTS.map((c) => {
      const group = countries.filter((country) => country.continent === c.id);
      const authors = group.reduce((s, country) => s + country.authors, 0);
      const sales = group.reduce((s, country) => s + country.sales, 0);
      const ranking = group
        .flatMap((country) => country.people)
        .filter((a) => a.sales > 0)
        .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"))
        .slice(0, 5)
        .map((a) => ({ name: a.name, sales: a.sales, pais: a.pais }));
      return {
        id: c.id,
        name: c.name,
        rings: c.rings,
        short: c.short,
        label: c.label,
        authors,
        sales,
        countries: group.length,
        authorShare: share(authors, intl.length),
        salesShare: share(sales, intlSales),
        ranking
      };
    });
    return {
      intlAuthors: intl.length,
      intlSales,
      countries,
      continents,
      unknown: [...unknown.entries()].sort((a, b) => b[1] - a[1])
    };
  }

  function worldSvg(pack) {
    const maxLand = Math.max(...pack.continents.map((c) => c.sales), 0);
    const maxDot = Math.max(...pack.countries.map((c) => c.sales), 0);
    const lands = pack.continents.map((c) => {
      const on = ui.world === "c:" + c.id;
      const fill = c.authors ? heat(c.sales, maxLand) : "#1c283c";
      const [x, y] = projectWorld(c.label[0], c.label[1]);
      return `<path class="continent${on ? " is-on" : ""}" data-world="c:${c.id}" tabindex="0" role="button" aria-label="${esc(c.name)}" aria-pressed="${on}" fill="${fill}" d="${c.rings.map(worldRing).join(" ")}"></path><text class="world-label" text-anchor="middle" x="${x.toFixed(1)}" y="${y.toFixed(1)}">${esc(c.short)}</text>`;
    }).join("");
    const dots = pack.countries.map((c) => {
      const on = ui.world === "p:" + c.key;
      const [x, y] = projectWorld(c.lon, c.lat);
      const r = (3.2 + 4.8 * Math.sqrt(maxDot ? c.sales / maxDot : 0)).toFixed(1);
      return `<circle class="country-dot${on ? " is-on" : ""}" data-world="p:${esc(c.key)}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" tabindex="0" role="button" aria-label="${esc(c.name)}" aria-pressed="${on}"></circle>`;
    }).join("");
    return `<svg class="world" viewBox="0 0 960 480" role="img" aria-label="Mapa por continente dos autores internacionais">${lands}${dots}</svg>`;
  }

  function worldDetailHtml(pack) {
    if (!ui.world) return "<p>Escolha um continente ou um país para ver autores e vendas.</p>";
    if (ui.world.startsWith("c:")) {
      const c = pack.continents.find((item) => item.id === ui.world.slice(2));
      if (!c) return "";
      const list = c.ranking.length
        ? `<ol>${c.ranking.map((a) => `<li><span></span><span>${esc(a.name)}<small>${esc(a.pais)}</small></span><b>${num(a.sales)}</b></li>`).join("")}</ol>`
        : "<p class='note'>Nenhum autor com venda neste continente.</p>";
      return `<h3>${esc(c.name)}</h3><p>${noun(c.authors, "autor", "autores")} · ${noun(c.countries, "país", "países")} · ${num(c.sales)} exemplares vendidos · ${pct(c.salesShare)} das vendas internacionais</p>${list}`;
    }
    const country = pack.countries.find((item) => item.key === ui.world.slice(2));
    if (!country) return "";
    const continent = pack.continents.find((item) => item.id === country.continent);
    const top = country.people
      .filter((a) => a.sales > 0)
      .sort((a, b) => b.sales - a.sales || a.name.localeCompare(b.name, "pt"))
      .slice(0, 5);
    const list = top.length
      ? `<ol>${top.map((a) => `<li><span></span><span>${esc(a.name)}</span><b>${num(a.sales)}</b></li>`).join("")}</ol>`
      : "<p class='note'>Nenhum autor com venda neste país.</p>";
    return `<h3>${esc(country.name)} · ${esc(continent ? continent.name : "")}</h3><p>${noun(country.authors, "autor", "autores")} · ${noun(country.titles, "título", "títulos")} · ${num(country.sales)} exemplares vendidos · ${pct(share(country.sales, pack.intlSales))} das vendas internacionais</p>${list}`;
  }

  function worldChipsHtml(pack) {
    return pack.countries.map((c) => {
      const id = "p:" + c.key;
      const on = ui.world === id;
      return `<button type="button" class="chip${on ? " is-on" : ""}" data-world="${esc(id)}" aria-pressed="${on}"><b>${esc(c.name)}</b><small>${noun(c.authors, "autor", "autores")} · ${pct(share(c.sales, pack.intlSales))} das vendas</small></button>`;
    }).join("");
  }

  function worldHtml() {
    const pack = worldPack();
    const lead = pack.continents.slice().sort((a, b) => b.sales - a.sales)[0];
    const cards = pack.continents.map((b) => `<article class="region">
      <div class="region-top"><h3>${esc(b.name)}</h3><span>${pct(b.authorShare)} dos autores internacionais<br>${pct(b.salesShare)} das vendas internacionais</span></div>
      <div class="twin">
        <div class="track"><span class="navy" style="width:${Math.max(b.authorShare * 100, b.authors ? 1.5 : 0)}%"></span></div>
        <div class="track thin"><span class="red" style="width:${Math.max(b.salesShare * 100, b.sales ? 1.5 : 0)}%"></span></div>
      </div>
      ${b.ranking.length ? `<ol>${b.ranking.map((a, i) => `<li><span>${i + 1}</span><span>${esc(a.name)}<small>${esc(a.pais)}</small></span><b>${num(a.sales)}</b></li>`).join("")}</ol>` : "<p class='note'>Nenhum autor internacional com venda neste continente.</p>"}
    </article>`).join("");
    const unknown = pack.unknown.length ? ` Origem sem país reconhecido: ${pack.unknown.map(([name, n]) => esc(name) + " (" + n + ")").join(", ")}.` : "";
    return panel("panel-world", "07 · Mundo", "Onde estão os autores internacionais",
      `<p class="insight">${esc(lead.name)} concentra ${pct(lead.authorShare)} dos autores internacionais e ${pct(lead.salesShare)} das vendas internacionais. Há autores em ${pack.countries.length} países.</p>
      <div class="map-layout">
        <div>
          ${worldSvg(pack)}
          <div class="uf-detail" id="worldDetail">${worldDetailHtml(pack)}</div>
          <div class="map-scale"><span>sem autores</span><i class="scale-bar"></i><span>mais vendas</span></div>
          <div class="chips" id="worldChips">${worldChipsHtml(pack)}</div>
        </div>
        <div>
          <p class="kicker">Destaques</p>
          <h2 style="font-family:var(--narrow);letter-spacing:-0.04em;font-size:32px;margin:4px 0 10px">Quem mais vende em cada continente</h2>
          <div class="regions">${cards}</div>
        </div>
      </div>`,
      "Cada autor internacional entra no país que concentra a maior parte da venda. O continente acompanha esse país. A cor do mapa segue o lifetime volume, sell-out via Nielsen. O ponto marca um país em que a editora tem autor." + unknown);
  }

  function abcHtml() {
    const pack = abcPack();
    const headShare = share(pack.headSales, pack.total);
    const tailShare = share(pack.tailSales, pack.total);
    const recorte = ui.abcScope === "nacionais" ? "No recorte nacional, " : "";
    return `<section class="panel" id="panel-abc">
      <div class="abc-top">
        <header class="panel-head"><p class="kicker">08 · Concentração</p><h2>Curva ABC</h2></header>
        <div class="scope" role="group" aria-label="Recorte da curva">
          <button type="button" data-scope="todos" class="${ui.abcScope === "todos" ? "is-on" : ""}" aria-pressed="${ui.abcScope === "todos"}">Catálogo inteiro</button>
          <button type="button" data-scope="nacionais" class="${ui.abcScope === "nacionais" ? "is-on" : ""}" aria-pressed="${ui.abcScope === "nacionais"}">Só nacionais</button>
        </div>
      </div>
      <p class="insight">${recorte}${noun(pack.nHead, "autor", "autores")} (20%) concentram ${pct(headShare)} das vendas. A cauda longa fica com ${pct(tailShare)}.</p>
      <div class="abc-grid">
        ${abcChart(pack)}
        <div class="abc-cards">
          <article class="abc-card head"><span>20% que mais vendem</span><strong class="big">${pct(headShare)}</strong><small>${noun(pack.nHead, "autor", "autores")} · ${num(pack.headSales)} exemplares vendidos</small></article>
          <article class="abc-card tail"><span>Cauda longa</span><strong class="big">${pct(tailShare)}</strong><small>${noun(pack.tail.length, "autor", "autores")} · ${num(pack.tailSales)} exemplares vendidos</small></article>
        </div>
      </div>
      <div class="abc-tools">
        <div class="scope">
          <button type="button" data-abcshow="head" class="${ui.abcShow === "head" ? "is-on" : ""}">Ver os 20%</button>
          <button type="button" data-abcshow="tail" class="${ui.abcShow === "tail" ? "is-on" : ""}">Ver a cauda</button>
        </div>
        <input id="abcQ" type="search" placeholder="Buscar autor neste grupo" value="${esc(ui.abcQuery)}" aria-label="Buscar autor na curva">
      </div>
      <p class="note" id="abcCount"></p>
      <ol class="abc-list" id="abcRows">${abcRowsHtml(pack)}</ol>
      <p class="note">O ranking é de autores, não de títulos. A venda de cada pessoa é a soma dos exemplares vendidos de todos os seus livros. Empates na fronteira dos 20% seguem a ordem alfabética.</p>
    </section>`;
  }

  function tableHead() {
    const cols = [
      ["isbn", "ISBN", false],
      ["vendas", "Lifetime volume", true],
      ["titulo", "Título", false],
      ["autor", "Autor", false],
      ["cidade", "Cidade de origem", false],
      ["pais", "País de origem", false],
      ["regiao", "Região de origem", false],
      ["nascimento", "Nascimento", false],
      ["falecimento", "Falecimento", false],
      ["sexo", "Sexo", false]
    ];
    return cols.map(([id, label, numeric]) => {
      const on = ui.tableSort === id;
      const arrow = on ? (ui.tableDir === "asc" ? " ↑" : " ↓") : "";
      const title = id === "vendas" ? ` title="Lifetime volume - sell-out (via Nielsen)"` : "";
      return `<th class="${numeric ? "num" : ""}" aria-sort="${on ? (ui.tableDir === "asc" ? "ascending" : "descending") : "none"}"><button type="button" data-sort="${id}"${title}>${label}${arrow}</button></th>`;
    }).join("");
  }

  function filteredRows() {
    const q = fold(ui.tableQuery).toLowerCase().trim();
    let list = model.rows.map((r, i) => ({ r, i }));
    if (q) {
      list = list.filter(({ r }) => [r.isbn, r.titulo, r.autor, r.cidade, r.pais, r.regiao, r.nascimento, r.falecimento, r.sexo, String(r.vendas)].some((v) => fold(v).toLowerCase().includes(q)));
    }
    const sign = ui.tableDir === "asc" ? 1 : -1;
    const key = ui.tableSort;
    list.sort((a, b) => {
      let c = 0;
      if (key === "vendas") c = a.r.vendas - b.r.vendas;
      else c = String(a.r[key] || "").localeCompare(String(b.r[key] || ""), "pt", { numeric: true, sensitivity: "base" });
      return c * sign || a.i - b.i;
    });
    return list.map((x) => x.r);
  }

  function tableHtml() {
    return `<section class="panel" id="panel-table">
      <header class="panel-head"><p class="kicker">09 · Arquivo</p><h2>Todas as colunas</h2></header>
      <div class="table-tools">
        <p class="note" id="tableCount" style="margin:0"></p>
        <input id="q" type="search" placeholder="Buscar em qualquer coluna" value="${esc(ui.tableQuery)}" aria-label="Buscar na tabela">
      </div>
      <div class="table-wrap">
        <table>
          <thead><tr>${tableHead()}</tr></thead>
          <tbody id="tableBody"></tbody>
        </table>
      </div>
      <div class="pager" id="pager"></div>
    </section>
    <details class="method"><summary>Como os recortes foram calculados</summary>
      <ul>
        <li>Cada autor entra uma vez. Grafias como “Sobrenome, Nome” e “Nome Sobrenome”, caixa alta e iniciais com ou sem ponto contam como a mesma pessoa.</li>
        <li>O volume do autor é a soma da coluna Lifetime volume - sell-out (via Nielsen). Célula vazia vale zero.</li>
        <li>O share de sell-out é a soma desse volume no grupo dividida pelo total do recorte.</li>
        <li>Nacional é o país que concentra a maior venda daquele autor. No mapa, cada título brasileiro conta no estado lido da cidade.</li>
        <li>A faixa etária usa o ano de nascimento diante de 2026. Data 01/01 não entra como aniversário: só o ano conta. Menores de 30; de 30 a 40, incluindo 40; de 41 a 50; acima de 50.</li>
        <li>A cabeça da curva ABC é 20% da contagem de autores, arredondada, depois de ordenar pela venda.</li>
      </ul>
    </details>`;
  }

  function paintTable() {
    const rows = filteredRows();
    const pages = Math.max(1, Math.ceil(rows.length / PAGE));
    if (ui.tablePage > pages) ui.tablePage = pages;
    if (ui.tablePage < 1) ui.tablePage = 1;
    const start = (ui.tablePage - 1) * PAGE;
    const slice = rows.slice(start, start + PAGE);
    document.getElementById("tableBody").innerHTML = slice.map((r) => `<tr>
      <td class="isbn">${esc(r.isbn)}</td>
      <td class="num">${num(r.vendas)}</td>
      <td>${esc(oneLine(r.titulo))}</td>
      <td>${esc(r.autor)}</td>
      <td>${esc(r.cidade)}</td>
      <td>${esc(r.pais)}</td>
      <td>${esc(r.regiao)}</td>
      <td>${esc(birthLabel(r.nascimento))}</td>
      <td>${esc(r.falecimento)}</td>
      <td>${esc(r.sexo)}</td>
    </tr>`).join("") || `<tr><td colspan="10">Nenhuma linha encontrada.</td></tr>`;
    document.getElementById("tableCount").textContent = `${noun(rows.length, "título", "títulos")} · página ${ui.tablePage} de ${pages}`;
    document.getElementById("pager").innerHTML = `<button type="button" data-page="${ui.tablePage - 1}" ${ui.tablePage <= 1 ? "disabled" : ""}>Anterior</button><span>${ui.tablePage} / ${pages}</span><button type="button" data-page="${ui.tablePage + 1}" ${ui.tablePage >= pages ? "disabled" : ""}>Próxima</button>`;
  }

  function paintAbcCount(pack) {
    const el = document.getElementById("abcCount");
    if (!el) return;
    const q = fold(ui.abcQuery).toLowerCase().trim();
    const source = ui.abcShow === "head" ? pack.head : pack.tail;
    const n = source.filter((a) => !q || fold(a.name).toLowerCase().includes(q)).length;
    el.textContent = ui.abcShow === "head"
      ? `${noun(n, "autor", "autores")} na cabeça da curva`
      : `${noun(n, "autor", "autores")} na cauda longa`;
  }

  function paintOriginTop() {
    const box = document.getElementById("originTop");
    if (box) {
      box.hidden = !ui.originTop;
      box.innerHTML = originRankHtml(ui.originTop);
    }
    document.querySelectorAll("[data-origin]").forEach((el) => {
      const on = el.getAttribute("data-origin") === ui.originTop;
      el.classList.toggle("is-on", on);
      el.setAttribute("aria-pressed", String(on));
    });
  }

  function paintWorldSelection() {
    const pack = worldPack();
    document.querySelectorAll("[data-world]").forEach((el) => {
      const on = el.getAttribute("data-world") === ui.world;
      el.classList.toggle("is-on", on);
      if (el.hasAttribute("aria-pressed")) el.setAttribute("aria-pressed", String(on));
    });
    const detail = document.getElementById("worldDetail");
    if (detail) detail.innerHTML = worldDetailHtml(pack);
  }

  function paintMapSelection() {
    document.querySelectorAll("[data-uf]").forEach((el) => {
      const on = el.getAttribute("data-uf") === ui.uf;
      el.classList.toggle("is-on", on);
      if (el.hasAttribute("aria-pressed")) el.setAttribute("aria-pressed", String(on));
    });
    const detail = document.getElementById("ufDetail");
    if (detail) detail.innerHTML = ufDetailHtml();
  }

  function renderAll() {
    const pack = abcPack();
    dash.innerHTML = kpisHtml(pack) + `<div class="split">${originHtml()}${genderHtml()}</div><div class="split">${lifeHtml()}${ageHtml()}</div>` + mapHtml() + worldHtml() + abcHtml() + tableHtml();
    paintTable();
    paintAbcCount(pack);
    if (!dash.dataset.bound) {
      dash.dataset.bound = "1";
      dash.addEventListener("input", onInput);
      dash.addEventListener("click", onClick);
      dash.addEventListener("keydown", onKey);
      dash.addEventListener("mousemove", onMove);
      dash.addEventListener("mouseleave", hideTip);
    }
    window.__census = model;
  }

  function hideTip() {
    tip.hidden = true;
    tip.classList.remove("wide");
  }

  function placeTip(e, width) {
    const x = Math.min(e.clientX + 14, window.innerWidth - width - 12);
    const y = Math.min(e.clientY + 16, window.innerHeight - 220);
    tip.style.left = x + "px";
    tip.style.top = y + "px";
  }

  function onMove(e) {
    if (!model || !e.target.closest) { hideTip(); return; }
    const gender = e.target.closest("[data-gender]");
    if (gender) {
      const id = gender.getAttribute("data-gender");
      const top = genderTop(id);
      tip.classList.add("wide");
      tip.hidden = false;
      tip.innerHTML = `<b>${esc(gender.getAttribute("data-label"))}</b>` + (top.length
        ? `<ol>${top.map((a, i) => `<li><span>${i + 1}</span><span>${esc(a.name)}</span><span>${num(a.sales)}</span></li>`).join("")}</ol>`
        : `<span>Sem venda nesta categoria.</span>`);
      placeTip(e, 300);
      return;
    }
    tip.classList.remove("wide");
    const place = e.target.closest("[data-world]");
    if (place) {
      const id = place.getAttribute("data-world");
      const pack = worldPack();
      let html = "";
      if (id.startsWith("c:")) {
        const c = pack.continents.find((item) => item.id === id.slice(2));
        if (c) html = `<b>${esc(c.name)}</b>${noun(c.authors, "autor", "autores")} · ${pct(c.salesShare)} das vendas internacionais`;
      } else {
        const country = pack.countries.find((item) => item.key === id.slice(2));
        if (country) html = `<b>${esc(country.name)}</b>${noun(country.authors, "autor", "autores")} · ${pct(share(country.sales, pack.intlSales))} das vendas internacionais`;
      }
      if (!html) { hideTip(); return; }
      tip.hidden = false;
      tip.innerHTML = html;
      placeTip(e, 260);
      return;
    }
    const el = e.target.closest("[data-uf]");
    if (!el) { hideTip(); return; }
    const sigla = el.getAttribute("data-uf");
    const st = window.BRAZIL_MAP.states.find((s) => s.sigla === sigla);
    const geo = geoView();
    const info = geo.ufs[sigla];
    tip.hidden = false;
    tip.innerHTML = info && info.authors
      ? `<b>${esc(st.nome)}</b>${noun(info.authors, "autor", "autores")} · ${pct(share(info.sales, geo.nationalSales))} das vendas nacionais`
      : `<b>${esc(st ? st.nome : sigla)}</b>Sem autores neste estado`;
    placeTip(e, 230);
  }

  function onInput(e) {
    if (e.target.id === "q") {
      ui.tableQuery = e.target.value;
      ui.tablePage = 1;
      paintTable();
    }
    if (e.target.id === "abcQ") {
      ui.abcQuery = e.target.value;
      const pack = abcPack();
      document.getElementById("abcRows").innerHTML = abcRowsHtml(pack);
      paintAbcCount(pack);
    }
  }

  function onClick(e) {
    const jump = e.target.closest("[data-jump]");
    if (jump) {
      const section = document.getElementById(jump.getAttribute("data-jump"));
      if (section) section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    const sort = e.target.closest("[data-sort]");
    if (sort) {
      const id = sort.getAttribute("data-sort");
      if (ui.tableSort === id) ui.tableDir = ui.tableDir === "asc" ? "desc" : "asc";
      else { ui.tableSort = id; ui.tableDir = id === "vendas" ? "desc" : "asc"; }
      ui.tablePage = 1;
      document.querySelector("#panel-table thead").innerHTML = `<tr>${tableHead()}</tr>`;
      paintTable();
      return;
    }
    const page = e.target.closest("[data-page]");
    if (page && !page.disabled) {
      ui.tablePage = Number(page.getAttribute("data-page"));
      paintTable();
      return;
    }
    const clarice = e.target.closest("[data-clarice]");
    if (clarice) {
      ui.geoClarice = clarice.getAttribute("data-clarice") === "sem" ? "sem" : "com";
      geoMemo = null;
      document.getElementById("panel-map").outerHTML = mapHtml();
      return;
    }
    const scope = e.target.closest("[data-scope]");
    if (scope) {
      ui.abcScope = scope.getAttribute("data-scope");
      ui.abcQuery = "";
      replaceAbc();
      return;
    }
    const show = e.target.closest("[data-abcshow]");
    if (show) {
      ui.abcShow = show.getAttribute("data-abcshow");
      replaceAbc();
      return;
    }
    const origin = e.target.closest("[data-origin]");
    if (origin) {
      const id = origin.getAttribute("data-origin");
      ui.originTop = ui.originTop === id ? null : id;
      paintOriginTop();
      return;
    }
    const place = e.target.closest("[data-world]");
    if (place) {
      const id = place.getAttribute("data-world");
      ui.world = ui.world === id ? null : id;
      paintWorldSelection();
      return;
    }
    const uf = e.target.closest("[data-uf]");
    if (uf) {
      const sigla = uf.getAttribute("data-uf");
      ui.uf = ui.uf === sigla ? null : sigla;
      paintMapSelection();
    }
  }

  function onKey(e) {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".continent, .country-dot")) {
      e.preventDefault();
      const id = e.target.getAttribute("data-world");
      ui.world = ui.world === id ? null : id;
      paintWorldSelection();
      return;
    }
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches(".uf")) {
      e.preventDefault();
      const sigla = e.target.getAttribute("data-uf");
      ui.uf = ui.uf === sigla ? null : sigla;
      paintMapSelection();
    }
  }

  function replaceAbc() {
    const current = document.getElementById("panel-abc");
    current.outerHTML = abcHtml();
    paintAbcCount(abcPack());
  }

  function loadText(text, name) {
    try {
      model = build(text);
      ui.uf = null;
      ui.originTop = null;
      ui.world = null;
      ui.geoClarice = "com";
      geoMemo = null;
      ui.tablePage = 1;
      ui.tableQuery = "";
      ui.abcQuery = "";
      fileName.textContent = name;
      drop.hidden = true;
      dash.hidden = false;
      renderAll();
    } catch (err) {
      drop.hidden = false;
      dropHint.textContent = err.message || "Não foi possível ler esse CSV.";
    }
  }

  function readFile(file) {
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      drop.hidden = false;
      dropHint.textContent = "Esse arquivo não é CSV. Use o arquivo exportado do censo.";
      return;
    }
    const reader = new FileReader();
    reader.onload = () => loadText(String(reader.result), file.name);
    reader.onerror = () => { dropHint.textContent = "Não foi possível ler o arquivo."; drop.hidden = false; };
    reader.readAsText(file, "UTF-8");
  }

  document.getElementById("importBtn").addEventListener("click", () => fileInput.click());
  document.getElementById("importBtnAlt").addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => { if (fileInput.files[0]) readFile(fileInput.files[0]); fileInput.value = ""; });
  document.addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("is-drag"); });
  document.addEventListener("dragleave", (e) => { if (!e.relatedTarget) document.body.classList.remove("is-drag"); });
  document.addEventListener("drop", (e) => {
    e.preventDefault();
    document.body.classList.remove("is-drag");
    if (e.dataTransfer && e.dataTransfer.files[0]) readFile(e.dataTransfer.files[0]);
  });

  fetch(CSV_NAME, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error("sem arquivo");
    return res.text();
  }).then((text) => loadText(text, CSV_NAME)).catch(() => {
    dropHint.textContent = "Escolha o CSV do censo. Se abrir o HTML direto do disco, o arquivo da pasta não carrega sozinho.";
  });
})();
