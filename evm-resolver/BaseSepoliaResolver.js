// const ethers = require('ethers');
// const CC_SDK = require('@1inch/cross-chain-sdk')
// const {SupportedChains} = require('@1inch/cross-chain-sdk');
// const F_SDK = require('@1inch/fusion-sdk');
// const { EscrowExtension } = require('@1inch/cross-chain-sdk');
// const { EvmCrossChainOrder } = require('@1inch/cross-chain-sdk');

// const bs_escrowFactory = require("./constants").base_sepolia.escrowFactory
// const resolver_address = require("./constants").resolverAddress
// const ERC20_TRUE = require("./constants").base_sepolia.ERC20_TRUE
// const limitOrderDomain = require("./constants").domain
// const limitOrderProtocol = require("./constants").limitOrderProtocol
// const USDC = require("./constants").base_sepolia.USDC

// const rpc = 'https://sepolia.base.org'
// const provider = new ethers.JsonRpcProvider(rpc)
// const wallet = new ethers.Wallet(process.env.PrivateKey, provider)
// const coder = new ethers.AbiCoder();

import {
  JsonRpcProvider,
  Wallet,
  AbiCoder
} from "ethers";

import * as CC_SDK from "@1inch/cross-chain-sdk";
const {
  SupportedChains,
  EscrowExtension,
  EvmCrossChainOrder
} = CC_SDK;

import * as F_SDK from "@1inch/fusion-sdk";

import {
  base_sepolia,
  resolverAddress as resolver_address,
  domain as limitOrderDomain,
  limitOrderProtocol
} from "./constants.js";

// unpack from base_sepolia
const bs_escrowFactory = base_sepolia.escrowFactory;
const ERC20_TRUE = base_sepolia.ERC20_TRUE;
const USDC = base_sepolia.USDC;

// provider, wallet, coder
const rpc = "https://sepolia.base.org";
const provider = new JsonRpcProvider(rpc);
const wallet = new Wallet(process.env.PrivateKey, provider);
const coder = new AbiCoder();


Error.stackTraceLimit = 50;

// for the sake of example, lets assume everyone is using stablecoins, so roughly 1:1 swaps

// for the sake of example, our wallet will be the maker and the resolver

// we've manually funded the resolver address with USDC so it passes the access token check

// random 32 byte value
const makerSecret = "0x" + Buffer.from(ethers.randomBytes(32)).toString("hex");
console.log("Maker secret:", makerSecret);
function newEvmOrder(escrowFactory, orderInfo, escrowParams, details, extra) {
    const SupportedEVMChains = SupportedChains.filter(chainId => chainId !== 501);
    const postInteractionData = CC_SDK.SettlementPostInteractionData.new({
        whitelist: details.whitelist.map((i) => ({
            address: i.address.inner,
            allowFrom: i.allowFrom,
        })),
        resolvingStartTime: details.resolvingStartTime ?? BigInt(Date.now()) / 1000n
    });
    if(!SupportedEVMChains.includes(escrowParams.dstChainId) && !orderInfo.receiver) {
        throw new Error('Receiver is required for non EVM chain');
    }
    const [complement, receiver] = orderInfo.receiver?.splitToParts() || [
        '0x00',
        CC_SDK.EvmAddress.ZERO
    ];
    const ext = new EscrowExtension(escrowFactory, details.auction, postInteractionData, extra?.permit
        ? new Interaction(orderInfo.makerAsset.inner, extra.permit)
        : undefined, escrowParams.hashLock, escrowParams.dstChainId, orderInfo.takerAsset, escrowParams.srcSafetyDeposit, escrowParams.dstSafetyDeposit, escrowParams.timelocks, complement);

    return new EvmCrossChainOrder(ext, {
        ...orderInfo,
        receiver,
        takerAsset: CC_SDK.EvmAddress.fromString(ERC20_TRUE)
    }, extra);
}
let now = BigInt(Date.now()) / 1000n
console.log("order fillable in :" + (now + 1n))

const order = newEvmOrder(
    CC_SDK.EvmAddress.fromString(bs_escrowFactory),
    // Order Info
    {
        salt: CC_SDK.randBigInt(1000n),
        maker: CC_SDK.EvmAddress.fromString(wallet.address),
        makingAmount: '1000000', // 1 USDC
        takingAmount: '999999', // 0.999999 USDC
        makerAsset: CC_SDK.EvmAddress.fromString(USDC), // USDC on Sepolia Base
        takerAsset: CC_SDK.EvmAddress.fromString('0xFFfFfFffFFfffFFfFFfFFFFFffFFFffffFfFFFfF'), // may be as big as bytes32, evm fill shrinks takerAsset to a uint160
        receiver: CC_SDK.EvmAddress.fromString(wallet.address), // required for evm -> non-evm, may be as big as a bytes32
    },
    // immutables
    {
        hashLock: CC_SDK.HashLock.forSingleFill(makerSecret),
        timelocks: CC_SDK.TimeLocks.new({
            srcWithdrawal: 1n,
            srcPublicWithdrawal: 10n,
            srcCancellation: 13n,
            srcPublicCancellation: 14n,
            dstWithdrawal: 15n,
            dstPublicWithdrawal: 16n,
            dstCancellation: 17n,
            // anything after is public cancellation
        }),
        srcChainId: limitOrderDomain.srcChainId, // Sepolia Base
        dstChainId: 999, // your new non-evm ID.
        srcSafetyDeposit: ethers.parseEther('0.001'),
        dstSafetyDeposit: ethers.parseEther('0.001'),
    },
    // dutch auction, whitelist and fee details.
    {
        auction: new CC_SDK.AuctionDetails({
            initialRateBump: 0,
            points: [],
            duration: 10000000n, // legit forever 
            startTime: now,
        }),
        // Your resolver address may be in the whitelist OR hold the access token to fill the order.
        whitelist: [
            {
                address: CC_SDK.EvmAddress.fromString(resolver_address),
                allowFrom: 0n, // no delay from the start of the auction
            }
        ],
        resolvingStartTime: 0n
    },
    // extra params
    {
        nonce: BigInt(ethers.randomBytes(4).join('')),
        allowPartialFills: false,
        allowMultipleFills: false,
    }
)



const typedOrder = order.getTypedData(Number(limitOrderDomain.chainId))
// YOU CANNOT USE THE DOMAIN FROM THE BUILT IN SDK FUNCTIONS.
const signature = await wallet.signTypedData(limitOrderDomain, {Order: typedOrder.types.Order}, typedOrder.message);

const builtOrder = order.build();
console.log(builtOrder);
console.log(signature);
const orderhash = await provider.call({
    to: limitOrderProtocol,
    data: new ethers.Interface([
        'function hashOrder((uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256)) view returns (bytes32)'
    ]).encodeFunctionData('hashOrder', [[
        builtOrder.salt,
        builtOrder.maker,
        builtOrder.receiver,
        builtOrder.makerAsset,
        builtOrder.takerAsset,
        builtOrder.makingAmount,
        builtOrder.takingAmount,
        builtOrder.makerTraits,
    ]]),
});

console.log("Order Hash:", orderhash);
// gotten from `forge build` the example resolver: https://github.com/1inch/cross-chain-resolver-example/blob/master/contracts/src/Resolver.sol
const resolverABI = require('./ResolverABI.json') 
const escrowFactoryABI = require('./EscrowFactoryABI.json');
const ERC20ABIStub = [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function allowance(address owner, address spender) external view returns (uint256)"
] 
const resolverContract = new ethers.Contract(resolver_address, resolverABI, wallet)
const escrowFactory = new ethers.Contract(bs_escrowFactory, escrowFactoryABI, provider) // we only need view calls

const usdcContract = new ethers.Contract(USDC, ERC20ABIStub, wallet)

// maker of the order needs to approve to the limit order contract, the resolver also needs to hold usdc.
// use https://faucet.circle.com/ to get base sepolia USDC. Base Sepolia USDC is also the access token for the escrow factory 

if((await usdcContract.allowance(wallet.address, limitOrderDomain.verifyingContract)) < BigInt(order.makingAmount)) {
    const approveTx = await usdcContract.approve(limitOrderDomain.verifyingContract, BigInt(order.makingAmount) * 100n)
    await approveTx.wait(1);
}

const fillAmount = BigInt(order.makingAmount);

let takerTraits = CC_SDK.TakerTraits.default()
        .setExtension(order.extension)
        .setAmountMode(CC_SDK.AmountMode.maker)
        .setAmountThreshold(BigInt(order.takingAmount))
let {args, trait} = takerTraits.encode();
console.log(order.escrowExtension.hashLockInfo)
const srcImmutables = order.toSrcImmutables(limitOrderDomain.chainId, new CC_SDK.EvmAddress(resolver_address), fillAmount.toString(), order.escrowExtension.hashLockInfo).toJSON()
// unfortunately the SDK function to construct the srcImmutables cannot properly handle
// the unique `domain` which means we must hash the order seperately.
srcImmutables.orderHash = orderhash
console.log(srcImmutables)

srcImmutables.orderHash = orderhash
console.log(srcImmutables)

let tempImmutables = {...srcImmutables}
// we need to apply the current time to the timelocks to compute the right escrow src (may vary by test run. You need to know the exact second the escrow will be deployed at
tempImmutables.timelocks = (BigInt(tempImmutables.timelocks) | ((now+2n) << 224n)).toString()
const srcEscrowAddress = await escrowFactory.addressOfEscrowSrc(
    tempImmutables
); 


console.log("Deploying src escrow at:", srcEscrowAddress);

// start time is "now" so this should be immediately fillable
// in prod you need to wait until the resolvingStartTime
const tx = await resolverContract.deploySrc(
    srcImmutables,
    builtOrder,
    ethers.Signature.from(signature).r,
    ethers.Signature.from(signature).yParityAndS,
    fillAmount,
    trait,
    args,
    {value: BigInt(srcImmutables.safetyDeposit), gasLimit: 2000000}
)

console.log(tx);

// process.exit(0);

// The txn emits the event `0x0e534c62f0afd2fa0f0fa71198e8aa2d549f24daf2bb47de0d5486c7ce9288ca`
// which is `SrcDeployed` containing the srcImmutables and ImmutablesComplement
// https://github.com/1inch/cross-chain-swap/blob/d0a59ab2c4b6be5c9769d5775769681873fcf162/contracts/interfaces/IEscrowFactory.sol#L44 
console.log(tx);

console.log("Deployed src escrow at:", srcEscrowAddress);

// *** This is what you do, now that you have all the source information
// *** build out the destination escrow!

// you need to first deploy the dst escrow contract. 
// next you wait for finality on both chains. since this is an example, waiting for a second should be enough
// just make sure the timelocks are dynamically changeable per-order

// next, make sure the dstEscrow is valid by checking it's immutables against the srcEscrow immutables
// Then you "share" the secret the user made with the resolver
// then the resolver settles the dst escrow

// now that the dstEscrow is settled, the resolver can settle the srcEscrow with the same secret! 
// *** ok, lets continue fufilling the source escrow only if the destination escrow is valid!


// srcEscrow won't be withdrawable till resolvingStartTime + srcWithdrawal timelock
// lets wait if we need to
console.log("Should settle at timestamp:", srcImmutables.resolvingStartTime + srcImmutables.srcWithdrawal)
if(BigInt(Date.now()) / 1000n < (srcImmutables.resolvingStartTime + srcImmutables.srcWithdrawal)) {
    await setTimeout(() => {}, 2000); // wait until the withdrawal timelock passes, here it is constant but in prod you need to dynamically wait
}

const srcWithdrawTx = await resolverContract.withdraw(srcEscrowAddress, makerSecret, srcImmutables)
console.log("Withdrew from src escrow:", srcWithdrawTx);