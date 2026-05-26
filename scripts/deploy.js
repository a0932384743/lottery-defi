const { ethers, network } = require("hardhat");
require("dotenv").config();

// Chainlink VRF v2 — https://docs.chain.link/vrf/v2/subscription/supported-networks
const VRF_CONFIG = {
  sepolia: {
    coordinator: "0x8103B0A8A00be2DDC778e6e7eaa21791Cd364625",
    gasLane: "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c",
    callbackGasLimit: 500_000,
  },
  mainnet: {
    coordinator: "0x271682DEB8C4E0901D1a1550aD2e64D568E69909",
    gasLane: "0x8af398995b04c28e9951adb9721ef74c74f93e6a478f39e7e0777be13527e7ef",
    callbackGasLimit: 500_000,
  },
};

async function main() {
  const networkName = network.name;
  console.log(`\nDeploying DecentralizedLottery to: ${networkName}`);

  if (networkName === "hardhat" || networkName === "localhost") {
    await deployWithMock();
  } else {
    await deployToLive(networkName);
  }
}

async function deployWithMock() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const VRFMock = await ethers.getContractFactory("VRFCoordinatorV2Mock");
  const vrfMock = await VRFMock.deploy(ethers.parseEther("0.1"), 1_000_000_000n);
  console.log("VRFCoordinatorV2Mock:", vrfMock.target);

  const subTx     = await vrfMock.createSubscription();
  const subReceipt = await subTx.wait();
  const subId      = subReceipt.logs[0].args[0];
  await vrfMock.fundSubscription(subId, ethers.parseEther("10"));
  console.log("VRF Subscription ID:", subId.toString());

  const GAS_LANE = "0x474e34a077df58807dbe9c96d3c009b23b3c6d0cce433e59bbf5b34f823bc56c";
  const Lottery = await ethers.getContractFactory("DecentralizedLottery");
  const lottery = await Lottery.deploy(vrfMock.target, subId, GAS_LANE, 500_000);
  await vrfMock.addConsumer(subId, lottery.target);

  console.log("DecentralizedLottery:", lottery.target);
  printEnvHint(lottery.target);
}

async function deployToLive(networkName) {
  const cfg = VRF_CONFIG[networkName];
  if (!cfg) throw new Error(`No VRF config for network: ${networkName}`);

  const subId = process.env.VRF_SUBSCRIPTION_ID;
  if (!subId) throw new Error("VRF_SUBSCRIPTION_ID not set in .env");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "ETH");

  const Lottery = await ethers.getContractFactory("DecentralizedLottery");
  const lottery = await Lottery.deploy(cfg.coordinator, subId, cfg.gasLane, cfg.callbackGasLimit);
  await lottery.waitForDeployment();

  console.log("\nDecentralizedLottery deployed to:", lottery.target);
  console.log("\n⚠️  Add this contract as a VRF consumer at https://vrf.chain.link");
  printEnvHint(lottery.target);
}

function printEnvHint(address) {
  console.log("\n─────────────────────────────────────────");
  console.log("Add to frontend/.env.local:");
  console.log(`NEXT_PUBLIC_LOTTERY_ADDRESS=${address}`);
  console.log("─────────────────────────────────────────\n");
}

main().catch((err) => { console.error(err); process.exit(1); });
