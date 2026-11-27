const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require("discord.js");
const config = require("../config");
const db = require("../db");
const exchange = require("../services/exchange");
const mexc = require("../services/mexc");
const { getServiceFeeRate } = require("../services/fees");
const { pendingTx } = require("../state/pending");
const { buildV2Payload, updateV2 } = require("../ui/v2");
const verifyHandler = require("./verify");

async function ephemeralV2(interaction, options) {
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ ephemeral: true });
  }
  return interaction.editReply(buildV2Payload(options));
}

const COIN_OPTS = [
  { label: "USDT", value: "usdt" },
  { label: "TRX", value: "trx" },
  { label: "LTC", value: "ltc" },
  { label: "BNB", value: "bnb" },
];

const NETWORK_OPTS = {
  usdt: [
    { label: "BEP20", value: "bep20" },
    { label: "TRC20", value: "trc20" },
  ],
  trx: [{ label: "TRC20", value: "trc20" }],
  ltc: [{ label: "LTC", value: "ltc" }],
  bnb: [{ label: "BEP20", value: "bep20" }],
};

function requireVerified(interaction) {
  return Boolean(db.getVerifiedUser(interaction.user.id));
}

async function showVerifyRequired(interaction) {
  return ephemeralV2(interaction, {
    lines: [
      "**본인인증이 필요합니다**",
      "아래에서 본인인증을 진행해 주세요.",
    ],
    buttons: [
      { id: "start_verify", label: "본인인증", style: ButtonStyle.Danger },
    ],
  });
}

async function handleButton(interaction, client) {
  const id = interaction.customId;

  if (
    id === "start_verify" ||
    id.startsWith("verify_")
  ) {
  const handled = await verifyHandler.routeVerifyButton(interaction, id);
    if (handled !== false) return handled;
  }

  const needsVerify = [
    "svc_use",
    "svc_purchase",
    "svc_info",
    "svc_charge",
    "svc_minimum",
    "send_coin",
  ];
  if (needsVerify.includes(id) && !requireVerified(interaction)) {
    return showVerifyRequired(interaction);
  }

  if (id === "svc_use") {
    return ephemeralV2(interaction, {
      lines: ["**대행 이용**", "송금할 코인을 선택하세요."],
      selects: [
        {
          id: "coin_select",
          placeholder: "코인 선택",
          options: COIN_OPTS,
        },
      ],
    });
  }

  if (id === "svc_purchase") {
    return ephemeralV2(interaction, {
      lines: ["**코인 매입**", "매입할 코인을 선택하세요."],
      selects: [
        {
          id: "purchase_select",
          placeholder: "코인 선택",
          options: COIN_OPTS,
        },
      ],
    });
  }

  if (id === "svc_info") {
    const u = db.getVerifiedUser(interaction.user.id);
    return ephemeralV2(interaction, {
      lines: [
        `**${interaction.user.displayName}** · ${u.name || "고객"}`,
        `보유: ₩${(u.now_amount || 0).toLocaleString("ko-KR")}`,
        `누적: ₩${(u.Total_amount || 0).toLocaleString("ko-KR")}`,
      ],
      buttons: [{ id: "view_history", label: "거래내역", style: ButtonStyle.Primary }],
    });
  }

  if (id === "svc_charge") {
    const modal = new ModalBuilder()
      .setCustomId("charge_modal")
      .setTitle("충전 금액");
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("charge_amount")
          .setLabel("충전 금액 (원)")
          .setStyle(TextInputStyle.Short)
          .setMinLength(1)
          .setMaxLength(12)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  if (id === "svc_minimum") {
    const mins = await exchange.getMinimumAmountsKrw();
    const body = exchange.SUPPORTED.map(
      (c) => `**${c}** · 최소 ₩${(mins[c] || 0).toLocaleString("ko-KR")}`
    ).join("\n");
    return ephemeralV2(interaction, {
      lines: ["**최소 송금 안내**", body],
    });
  }

  if (id === "view_history") {
    const txs = db.getTransactionHistory(interaction.user.id, 10);
    const lines = txs.map(
      (t, i) =>
        `${i + 1}. ${t.type} ₩${t.amount.toLocaleString("ko-KR")} ${t.coin_type || ""}`
    );
    return ephemeralV2(interaction, {
      lines: lines.length ? lines : ["거래내역이 없습니다."],
    });
  }

  if (id === "send_coin") {
    if (!interaction.deferred && !interaction.replied) {
      await interaction.deferUpdate();
    }
    const data = pendingTx.get(interaction.user.id);
    if (!data) {
      return interaction.followUp({
        ...require("../ui/v2").buildV2Payload({
          lines: ["세션 만료. 다시 시도해 주세요."],
        }),
        ephemeral: true,
      });
    }

    if (!db.subtractBalance(interaction.user.id, data.krwAmount)) {
      return interaction.followUp({
        ...require("../ui/v2").buildV2Payload({ lines: ["잔액 부족"] }),
        ephemeral: true,
      });
    }

    const result = await mexc.withdrawCoin(
      data.sendAmount,
      data.address,
      data.network,
      data.coin
    );

    pendingTx.delete(interaction.user.id);

    if (!result.success) {
      db.addBalance(interaction.user.id, data.krwAmount, "환불");
      return interaction.followUp({
        ...require("../ui/v2").buildV2Payload({
          lines: ["**송금 실패**", result.error, "금액이 환불되었습니다."],
        }),
        ephemeral: true,
      });
    }

    db.addTransactionHistory(interaction.user.id, data.krwAmount, "송금", {
      txid: result.txid,
      coinType: result.coin,
      address: data.address,
      fee: Math.round(data.totalFeeKrw),
    });

    return interaction.followUp({
      ...require("../ui/v2").buildV2Payload({
        lines: [
          `**${result.coin} 송금 성공**`,
          `TXID: \`${result.txid}\``,
          `링크: ${result.share_link}`,
        ],
      }),
      ephemeral: true,
    });
  }

  return null;
}

async function handleSelect(interaction) {
  const id = interaction.customId;

  if (id === "purchase_select") {
    const coin = interaction.values[0].toUpperCase();
    const addr = config.coinAddresses[coin] || "주소 미설정";
    return updateV2(interaction, {
      lines: [
        `**${coin} 매입**`,
        "아래 주소로 입금해 주세요.",
        `\`\`\`${addr}\`\`\``,
      ],
    });
  }

  if (id === "coin_select") {
    const coin = interaction.values[0];
    const nets = NETWORK_OPTS[coin] || NETWORK_OPTS.usdt;
    return updateV2(interaction, {
      lines: [`**${coin.toUpperCase()} 송금**`, "네트워크를 선택하세요."],
      selects: [
        {
          id: `network_select_${coin}`,
          placeholder: "네트워크",
          options: nets,
        },
      ],
    });
  }

  if (id.startsWith("network_select_")) {
    const coin = id.replace("network_select_", "");
    const network = interaction.values[0];
    const modal = new ModalBuilder()
      .setCustomId(`amount_modal_${network}_${coin}`)
      .setTitle(`${coin.toUpperCase()} 송금`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("원화 금액")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("address")
          .setLabel("지갑 주소")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  return null;
}

async function handleModal(interaction, client) {
  if (interaction.customId === "verify_info_modal") {
    return verifyHandler.onInfoModal(interaction);
  }
  if (interaction.customId === "verify_code_modal") {
    return verifyHandler.onCodeModal(interaction, client);
  }

  if (interaction.customId === "charge_modal") {
    await interaction.deferReply({ ephemeral: true });
    const raw = interaction.fields.getTextInputValue("charge_amount");
    const amount = parseInt(raw.replace(/[^\d]/g, ""), 10);
    if (!amount || amount < 500) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: ["최소 충전 금액은 500원입니다."],
        })
      );
    }
    return interaction.editReply(
      require("../ui/v2").buildV2Payload({
        lines: [
          `**충전 안내** · ₩${amount.toLocaleString("ko-KR")}`,
          `\`\`\`${config.depositBankName} ${config.depositAccountNo}`,
          `예금주: ${config.depositAccountHolder}\`\`\``,
          "입금 후 DM으로 영수증을 보내 주세요.",
        ],
      })
    );
  }

  if (interaction.customId.startsWith("amount_modal_")) {
    await interaction.deferReply({ ephemeral: true });
    const parts = interaction.customId.split("_");
    const coin = parts[parts.length - 1];
    const network = parts[parts.length - 2];
    const krw = parseFloat(
      interaction.fields.getTextInputValue("amount").replace(/[^\d.]/g, "")
    );
    const address = interaction.fields.getTextInputValue("address").trim();

    if (!krw || !address) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({ lines: ["입력값을 확인해 주세요."] })
      );
    }

    const mins = await exchange.getMinimumAmountsKrw();
    const minKrw = mins[coin.toUpperCase()] || 10000;
    if (krw < minKrw) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({
          lines: [`최소 ₩${minKrw.toLocaleString("ko-KR")}`],
        })
      );
    }

    const user = db.getVerifiedUser(interaction.user.id);
    if (!user || user.now_amount < krw) {
      return interaction.editReply(
        require("../ui/v2").buildV2Payload({ lines: ["잔액 부족"] })
      );
    }

    const krwRate = await exchange.getExchangeRate();
    const kimchi = await exchange.getKimchiPremium();
    const actualRate = krwRate * (1 + kimchi / 100);
    const coinPrice = await exchange.getCoinPrice(coin);
    const feeRate = getServiceFeeRate() + kimchi / 100;
    const chainFee = exchange.getTransactionFee(
      coin,
      network.toUpperCase()
    );
    const exchangeFeeKrw = chainFee * coinPrice * actualRate;
    const serviceFeeKrw = krw * feeRate;
    const totalFee = serviceFeeKrw + exchangeFeeKrw;
    const sendKrw = krw - totalFee;
    const sendAmount = exchange.krwToCoinAmount(sendKrw, coinPrice, actualRate);

    pendingTx.set(interaction.user.id, {
      coin: coin.toUpperCase(),
      network,
      address,
      krwAmount: Math.floor(krw),
      sendAmount,
      totalFeeKrw: totalFee,
    });

    return interaction.editReply(
      require("../ui/v2").buildV2Payload({
        lines: [
          `**${coin.toUpperCase()} 송금 준비**`,
          `차감: ₩${Math.floor(krw).toLocaleString("ko-KR")}`,
          `예상 송금: ${sendAmount.toFixed(6)} ${coin.toUpperCase()}`,
          `수수료 합: ₩${Math.floor(totalFee).toLocaleString("ko-KR")}`,
          `주소: \`${address}\``,
        ],
        buttons: [{ id: "send_coin", label: "송금하기", style: ButtonStyle.Danger }],
      })
    );
  }

  return null;
}

module.exports = { handleButton, handleSelect, handleModal };