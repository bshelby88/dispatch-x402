const BASE_RPC_URL = "https://mainnet.base.org";
const RUBY_WISDOM_NFT = "0xF582ac875D3E19E3adEC7EB7548Fe89B3b77Cb6b";
const DIAMOND_GENESIS_NFT = "0xc771263915cbE17d0f2835319347De279532E253";

/**
 * Checks if a wallet address holds any RAE utility NFTs on Base mainnet (ERC-1155).
 * @param {string} address - The user's EVM wallet address.
 * @returns {Promise<{ownsRuby: boolean, ownsDiamond: boolean, discount: number}>}
 */
async function getNFTDiscount(address) {
  if (!address || !address.startsWith("0x")) {
    return { ownsRuby: false, ownsDiamond: false, discount: 0 };
  }

  const cleanAddr = address.toLowerCase().replace("0x", "").padStart(64, "0");
  const tokenId = "1".padStart(64, "0");
  const data = "0x00fdd58e" + cleanAddr + tokenId; // balanceOf(address, uint256) signature

  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "eth_call",
    params: [
      {
        to: RUBY_WISDOM_NFT,
        data: data
      },
      "latest"
    ]
  };

  const payloadDiamond = {
    jsonrpc: "2.0",
    id: 2,
    method: "eth_call",
    params: [
      {
        to: DIAMOND_GENESIS_NFT,
        data: data
      },
      "latest"
    ]
  };

  try {
    const [resRuby, resDiamond] = await Promise.all([
      fetch(BASE_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).then(r => r.json()),
      fetch(BASE_RPC_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadDiamond)
      }).then(r => r.json())
    ]);

    const rubyVal = resRuby.result && resRuby.result !== "0x" ? parseInt(resRuby.result, 16) : 0;
    const diamondVal = resDiamond.result && resDiamond.result !== "0x" ? parseInt(resDiamond.result, 16) : 0;

    const ownsRuby = rubyVal > 0;
    const ownsDiamond = diamondVal > 0;

    // Pricing Discounts:
    // Owns Diamond Genesis -> 100% discount (Free access pass)
    // Owns Ruby Wisdom -> 50% discount
    let discount = 0;
    if (ownsDiamond) {
      discount = 1.0;
    } else if (ownsRuby) {
      discount = 0.5;
    }

    return {
      ownsRuby,
      ownsDiamond,
      discount
    };
  } catch (e) {
    console.error("Failed to query NFT balance:", e.message);
    return { ownsRuby: false, ownsDiamond: false, discount: 0 };
  }
}

module.exports = { getNFTDiscount };
