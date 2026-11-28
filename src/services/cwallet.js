const exchange = require("./exchange");
const cwalletSession = require("../lib/cwalletSession");
const { transactionPreCheck } = require("./cwalletSecurity");
const config = require("../config");

const BALANCE_PATH = "/cctip/v1/account/asset/balance/get";
const USDT_MERGE_ID = "8e5741cf-6e51-4892-9d04-3d40e1dd0128";

/** Discord 네트워크 value → Cwallet chain_id / network 라벨 */
const NETWORK_MAP = {
  USDT: { bep20: "BSC", trc20: "TRX" },
  TRX: { trc20: "TRX" },
  LTC: { ltc: "LTC" },
  BNB: { bep20: "BSC" },
};

const NETWORK_LABEL = {
  USDT: { bep20: "BEP20", trc20: "TRC20" },
  BNB: { bep20: "BEP20" },
  TRX: { trc20: "TRC20" },
  LTC: { ltc: "LTC" },
};

function hasSession() {
  return cwalletSession.hasStorageState();
}

function parseBalanceRow(row) {
  const sym = String(row.symbol || "").toUpperCase();
  const bal = parseFloat(row.balance ?? row.quantity ?? 0) || 0;
  return { ...row, symbol: sym, balance: Math.max(0, bal) };
}

async function fetchBalanceRows() {
  if (!hasSession()) return [];
  const data = await cwalletSession.postApi(BALANCE_PATH);
  if (!data || data.code !== 10000 || !Array.isArray(data.data)) return [];
  return data.data.map(parseBalanceRow);
}

async function getAllBalances() {
  const rows = await fetchBalanceRows();
  const result = {};
  for (const c of exchange.SUPPORTED) result[c] = 0;
  for (const row of rows) {
    if (!exchange.SUPPORTED.includes(row.symbol)) continue;
    if (row.type === "MERGE") {
      result[row.symbol] = row.balance;
    } else if (!result[row.symbol]) {
      result[row.symbol] = row.balance;
    }
  }
  return result;
}

async function getMergeTokenId(symbol) {
  const upper = symbol.toUpperCase();
  const rows = await fetchBalanceRows();
  const merge = rows.find(
    (r) => r.symbol === upper && String(r.type).toUpperCase() === "MERGE"
  );
  return merge?.token_id || null;
}

async function resolveChainToken(symbol, network) {
  const upper = symbol.toUpperCase();
  const mergeId = await getMergeTokenId(upper);
  if (!mergeId) return { ok: false, error: `${upper} 토큰 정보 없음` };

  const chainsRes = await cwalletSession.postApi(
    "/cctip/v1/chain/token/chains/get",
    { token_id: mergeId }
  );
  const raw = chainsRes?.data;
  const chains = Array.isArray(raw)
    ? raw
    : Array.isArray(raw?.lists)
      ? raw.lists
      : [];

  const netKey = String(network || "").toLowerCase();
  const chainHint = NETWORK_MAP[upper]?.[netKey];
  const labelHint = NETWORK_LABEL[upper]?.[netKey];

  let picked = chains.find(
    (c) =>
      (labelHint && String(c.network).toUpperCase() === labelHint) ||
      (chainHint &&
        String(c.chain_id).toUpperCase() === chainHint.toUpperCase())
  );

  if (!picked && upper === "TRX") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "TRX");
  }
  if (!picked && upper === "LTC") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "LTC");
  }
  if (!picked && upper === "BNB") {
    picked = chains.find((c) => String(c.chain_id).toUpperCase() === "BSC");
  }
  if (!picked) {
    return { ok: false, error: `지원하지 않는 네트워크: ${network}` };
  }
  return { ok: true, token: picked, mergeTokenId: mergeId };
}

async function getWithdrawFee(chain_id, contract) {
  const data = await cwalletSession.postApi("/cctip/v1/chain/token/fee", {
    chain_id,
    contract,
  });
  if (data?.code !== 10000 || !data?.data) {
    return { ok: false, error: data?.msg || "수수료 조회 실패" };
  }
  return { ok: true, fee: data.data };
}

function txLink(txid, coin, network) {
  if (!txid || !isLikelyOnChainTxid(txid)) return null;
  const c = coin.toUpperCase();
  const net = String(network || "").toLowerCase();
  if (c === "TRX" || net === "trc20") {
    return `https://tronscan.org/#/transaction/${txid}`;
  }
  if (c === "LTC" || net === "ltc") {
    return `https://blockchair.com/litecoin/transaction/${txid}`;
  }
  return `https://bscscan.com/tx/${txid}`;
}

/** bill_id·주문번호와 구분 — TXID처럼 보이는 온체인 해시만 */
function isLikelyOnChainTxid(id) {
  const s = String(id || "").trim();
  if (!s || s.length < 16) return false;
  if (/^\d{18,}$/.test(s)) return false;
  if (/^[A-Fa-f0-9]{64}$/.test(s)) return true;
  if (/^[A-Fa-f0-9]{40}$/.test(s)) return true;
  if (/^T[A-Za-z0-9]{30,}$/.test(s)) return true;
  return s.length >= 32 && /[A-Fa-z]/.test(s);
}

function extractTxidFromWithdrawBody(body, billId) {
  const candidates = [
    body.txid,
    body.hash,
    body.tx_hash,
    body.withdraw_hash,
    body.chain_hash,
    body.chain_txid,
  ].filter(Boolean);
  for (const c of candidates) {
    if (isLikelyOnChainTxid(c)) return String(c);
  }
  const url = body.txid_url || body.tx_url || body.explorer_url;
  if (url) {
    const m =
      url.match(/\/transaction\/([A-Fa-f0-9]{16,})/i) ||
      url.match(/\/tx\/(0x[A-Fa-f0-9]{40,})/i);
    if (m) return m[1];
  }
  return isLikelyOnChainTxid(billId) ? String(billId) : null;
}

async function waitForWithdrawTxid(billId, symbol, attempts = 6) {
  for (let i = 0; i < attempts; i++) {
    const detail = await cwalletSession.postApi(
      "/cctip/v1/transaction/detail/get",
      { bill_id: billId, symbol }
    );
    if (detail?.code === 10000 && detail.data) {
      const txid = extractTxidFromWithdrawBody(detail.data, billId);
      if (txid) return txid;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  return null;
}

/** Cwallet/Web과 동일: precision 자리로 내림, 지수 표기 제거 */
function formatCoinAmount(amount, precision = 8) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  const p = Math.max(0, Math.min(18, Number(precision) || 8));
  const scale = 10 ** p;
  const floored = Math.floor(n * scale + 1e-12) / scale;
  const s = floored.toFixed(p).replace(/\.?0+$/, "");
  if (!s || !/^\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

function formatAmount(amount, precision) {
  if (precision != null) return formatCoinAmount(amount, precision);
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  return formatCoinAmount(n, 8);
}

async function swapMarketUsdtToCoin({
  toSymbol,
  fromUsdtAmount,
  toQuantity,
}) {
  const toId = await getMergeTokenId(toSymbol);
  if (!toId) {
    return { success: false, error: `${toSymbol} 스왑 대상 없음` };
  }

  const rate = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/rate/get",
    { from: USDT_MERGE_ID, to: toId }
  );
  if (rate?.code !== 10000 || !rate?.data?.pre_id) {
    return { success: false, error: rate?.msg || "스왑 시세 조회 실패" };
  }

  const fromAmt = formatCoinAmount(fromUsdtAmount, 6);
  if (!fromAmt) return { success: false, error: "스왑 금액 오류" };

  const toPrecision = 6;
  let toAmt = toQuantity;
  if (!toAmt) {
    const fromApi = parseFloat(
      rate.data.to_amount ?? rate.data.to_quantity ?? rate.data.quantity
    );
    if (Number.isFinite(fromApi) && fromApi > 0) {
      toAmt = formatCoinAmount(fromApi, toPrecision);
    } else {
      const r = Number(rate.data.rate);
      toAmt = formatCoinAmount(Number(fromAmt) * r, toPrecision);
    }
  } else {
    toAmt = formatCoinAmount(toAmt, toPrecision);
  }

  const sec = await transactionPreCheck("trade.swap.market", {
    quote_id: rate.data.pre_id,
    from_coin_id: USDT_MERGE_ID,
    to_coin_id: toId,
    from_amount: fromAmt,
    to_amount: toAmt,
  });
  if (!sec.ok) {
    const { mapSecurityError } = require("./cwalletSecurity");
    return {
      success: false,
      error: mapSecurityError(sec.error) || sec.error,
    };
  }

  const submit = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/order/submit",
    {
      from: USDT_MERGE_ID,
      to: toId,
      from_quantity: fromAmt,
      to_quantity: toAmt,
      torrance: "0.5",
      pre_id: rate.data.pre_id,
      operation_id: sec.operation_id,
      operation_grant_token: sec.operation_grant_token,
      security_payload_version: sec.security_payload_version,
    }
  );

  if (submit?.code !== 10000) {
    return { success: false, error: submit?.msg || "스왑 실패" };
  }

  const order = submit.data || submit;
  return {
    success: true,
    orderNo: order.order_no || order.orderNo,
    type: order.type,
  };
}

/** 구매자 USDT 예산 → 스왑 시세 기대 수령량 (스왑 수수료 반영) */
async function getSwapQuote(fromUsdtAmount, toSymbol) {
  if (!hasSession()) {
    return { ok: false, error: "Cwallet 세션이 없습니다." };
  }
  const fromAmt = formatAmount(fromUsdtAmount);
  if (!fromAmt) return { ok: false, error: "금액 오류" };

  const toId = await getMergeTokenId(toSymbol);
  if (!toId) return { ok: false, error: `${toSymbol} 스왑 대상 없음` };

  const rate = await cwalletSession.postApi(
    "/cctip/v1/swap/coin/rate/get",
    { from: USDT_MERGE_ID, to: toId }
  );
  if (rate?.code !== 10000 || !rate?.data) {
    return { ok: false, error: rate?.msg || "스왑 시세 조회 실패" };
  }

  const r = Number(rate.data.rate);
  const toFromApi = parseFloat(
    rate.data.to_amount ?? rate.data.to_quantity ?? rate.data.quantity
  );
  const toAmount =
    Number.isFinite(toFromApi) && toFromApi > 0
      ? toFromApi
      : Number(fromAmt) * (Number.isFinite(r) ? r : 0);

  if (!toAmount || toAmount <= 0) {
    return { ok: false, error: "스왑 예상 수량 없음" };
  }

  return {
    ok: true,
    fromAmount: Number(fromAmt),
    toAmount,
    preId: rate.data.pre_id,
  };
}

/** 웹 송금과 동일. 숫자 Cwallet ID는 내부 송금(2), 그 외 주소는 온체인(1). */
function isCwalletId(address) {
  return /^[0-9]{4,}$/.test(String(address || "").trim());
}

function submitTypeFor(address) {
  return isCwalletId(address) ? 2 : 1;
}

/**
 * 웹 Send 페이지와 같은 수수료.
 * 내부 주소·Cwallet ID는 0, 외부 주소는 fee.value (risk_value 아님).
 */
async function resolveWithdrawFee({ token, address, grossAmount }) {
  const feeRes = await getWithdrawFee(token.chain_id, token.contract);
  if (!feeRes.ok) return feeRes;

  const networkFee = String(feeRes.fee.value ?? "0");
  const sameToken =
    String(feeRes.fee.symbol || token.symbol).toUpperCase() ===
    String(token.symbol || "").toUpperCase();
  const submitType = submitTypeFor(address);

  if (isCwalletId(address)) {
    return { ok: true, feeStr: "0", sameToken, submitType, isInner: true };
  }
  if (!String(address || "").trim()) {
    return { ok: true, feeStr: networkFee, sameToken, submitType, isInner: false };
  }

  const check = await cwalletSession.postApi(
    "/cctip/v1/account/asset/withdraw/check",
    {
      chain_id: token.chain_id,
      contract: token.contract ?? "",
      address: String(address).trim(),
      memo: "",
      amount: String(grossAmount),
      submit_type: submitType,
    }
  );
  if (check?.code !== 10000) {
    const { mapSecurityError } = require("./cwalletSecurity");
    return {
      ok: false,
      error: mapSecurityError(check?.msg, check?.code),
    };
  }

  const isInner = Boolean(check.data?.is_inner_tx);
  return {
    ok: true,
    feeStr: isInner ? "0" : networkFee,
    sameToken,
    submitType,
    isInner,
  };
}

async function estimateWithdrawFeeCoin(symbol, network, address) {
  const resolved = await resolveChainToken(symbol, network);
  if (!resolved.ok) return resolved;
  const quote = await resolveWithdrawFee({
    token: resolved.token,
    address,
    grossAmount: "10",
  });
  if (!quote.ok) {
    const feeRes = await getWithdrawFee(
      resolved.token.chain_id,
      resolved.token.contract
    );
    if (!feeRes.ok) return { ok: false, error: feeRes.error };
    return { ok: true, fee: parseFloat(feeRes.fee.value) || 0 };
  }
  return { ok: true, fee: parseFloat(quote.feeStr) || 0 };
}

async function withdrawOnChain({
  token,
  amount,
  address,
  memo = "",
}) {
  const precision = Number(token.precision) || 8;
  const gross = formatCoinAmount(amount, precision);
  if (!gross) return { success: false, error: "송금 수량 오류" };

  const quote = await resolveWithdrawFee({
    token,
    address,
    grossAmount: gross,
  });
  if (!quote.ok) return { success: false, error: quote.error };

  let value = gross;
  if (quote.sameToken && Number(quote.feeStr) > 0) {
    value = formatCoinAmount(Number(gross) - Number(quote.feeStr), precision);
    if (!value) {
      return { success: false, error: "송금액이 출금 수수료보다 작습니다." };
    }
  }

  const billRes = await cwalletSession.postApi(
    "/cctip/v1/account/asset/withdraw/new",
    { submit_type: quote.submitType }
  );
  if (billRes?.code !== 10000 || !billRes?.data) {
    return { success: false, error: billRes?.msg || "출금 주문 생성 실패" };
  }
  const bill_id = billRes.data;

  const withdrawPayload = {
    bill_id,
    chain_id: token.chain_id,
    contract: token.contract ?? "",
    symbol: token.symbol,
    amount: value,
    fee: quote.feeStr,
    destination: String(address).trim(),
    memo: memo || "",
    submit_type: quote.submitType,
  };

  const sec = await transactionPreCheck("wallet.withdraw", withdrawPayload);
  if (!sec.ok) {
    return { success: false, error: sec.error || "보안 확인 실패" };
  }

  const submit = await cwalletSession.postApi(
    "/cctip/v1/account/asset/withdraw/submit",
    {
      bill_id,
      symbol: token.symbol,
      address: String(address).trim(),
      value,
      timestamp: Date.now(),
      fee: quote.feeStr,
      chain_id: token.chain_id,
      submit_type: quote.submitType,
      memo: memo || "",
      contract: token.contract ?? "",
      operation_id: sec.operation_id,
      operation_grant_token: sec.operation_grant_token,
      security_payload_version: sec.security_payload_version,
    }
  );

  if (submit?.code !== 10000) {
    const { mapSecurityError } = require("./cwalletSecurity");
    return {
      success: false,
      error: mapSecurityError(submit?.msg, submit?.code) || submit?.msg || "출금 실패",
    };
  }

  const body = submit.data || {};
  let txid = extractTxidFromWithdrawBody(body, bill_id);
  if (!txid) {
    await new Promise((r) => setTimeout(r, 2000));
    txid = await waitForWithdrawTxid(bill_id, token.symbol);
    if (!txid) txid = extractTxidFromWithdrawBody(body, bill_id);
  }

  const share_link =
    body.txid_url ||
    body.tx_url ||
    (txid ? txLink(txid, token.symbol, token.network) : null);

  return {
    success: true,
    txid: txid || String(bill_id),
    txid_on_chain: Boolean(txid),
    bill_id,
    network: token.network || token.chain_id,
    share_link,
    fee: parseFloat(quote.feeStr) || 0,
    amount_sent: value,
  };
}

/**
 * 구매자가 낸 원화 → 서비스 수수료 제외 USDT 예산만 사용.
 * USDT는 그 예산만큼, 다른 코인은 스왑으로 받은 수량만큼 출금한다.
 * 네트워크 수수료는 웹과 같이 수령액에서 빼고, 내부 주소면 0이다.
 */
async function fulfillBuyerSend({ usdtSpend, coin, address, network }) {
  if (!hasSession()) {
    return { success: false, error: "Cwallet 세션이 없습니다." };
  }

  const upper = String(coin).toUpperCase();
  const spend = Number(usdtSpend);
  if (!Number.isFinite(spend) || spend <= 0) {
    return { success: false, error: "USDT 예산 오류" };
  }

  const resolved = await resolveChainToken(upper, network);
  if (!resolved.ok) return { success: false, error: resolved.error };

  const balances = await getAllBalances();
  const usdtBal = balances.USDT || 0;
  if (usdtBal < spend) {
    return {
      success: false,
      error: `USDT 재고 부족 (${usdtBal.toFixed(2)} < ${spend.toFixed(6)})`,
    };
  }

  if (upper === "USDT" && spend < exchange.MIN_COIN.USDT) {
    return { success: false, error: `최소 ${exchange.MIN_COIN.USDT} USDT` };
  }

  let sendQty;

  if (upper === "USDT") {
    const precision = Number(resolved.token.precision) || 6;
    sendQty = formatCoinAmount(spend, precision);
    if (!sendQty) {
      return { success: false, error: "송금 수량 오류" };
    }
  } else {
    const before = balances[upper] || 0;

    const swap = await swapMarketUsdtToCoin({
      toSymbol: upper,
      fromUsdtAmount: spend.toFixed(6),
      toQuantity: null,
    });
    if (!swap.success) {
      return { success: false, error: swap.error || "스왑 실패" };
    }

    await new Promise((r) => setTimeout(r, 2500));
    const after = (await getAllBalances())[upper] || 0;
    const gained = after - before;
    if (gained <= 0) {
      return {
        success: false,
        error: "스왑 후 코인 수량을 확인하지 못했습니다.",
      };
    }

    const precision = Number(resolved.token.precision) || 6;
    sendQty = formatCoinAmount(gained, precision);
    if (!sendQty) {
      return { success: false, error: "스왑 후 송금 수량이 없습니다." };
    }
  }

  const minCoin = exchange.MIN_COIN[upper] ?? 0;
  if (Number(sendQty) < minCoin) {
    return {
      success: false,
      error: `최소 송금 미달 (${minCoin} ${upper})`,
    };
  }

  const send = await withdrawOnChain({
    token: resolved.token,
    amount: sendQty,
    address,
  });
  if (!send.success) return send;

  return {
    success: true,
    txid: send.txid,
    txid_on_chain: send.txid_on_chain,
    network: send.network,
    coin: upper,
    to_address: address,
    share_link: send.share_link,
    fee: send.fee,
    amount_sent: send.amount_sent || sendQty,
    usdt_spend: spend,
  };
}

module.exports = {
  hasSession,
  getAllBalances,
  fulfillBuyerSend,
  getSwapQuote,
  estimateWithdrawFeeCoin,
  swapMarketUsdtToCoin,
};