# Hackers' Log

## 20250925 
* 1845 Hackathon hasn't started yet so we are not to start work officially. We could and no one would know. But that wouldn't be as fun. So we went around to enjoy the venue (beautiful!), chatted with sponsors and said hi to familiar faces.
* 1945 Kartik says the hackathon officially starts now. Yay~ But we are so jetlagged and sleepy. Might need to nap after Vitalik's talk.


## 20250926
* 0136 Oh great... it's already tomorrow. Wifi is horrible were we are and also no spare power outlets here. Need to relocate. Before that... we are starving... missed the midnight snack while snoring away.
* 0333 Power is back again. But wifi equally horrible. We are doomed.
* 0526 We met some cool people! And spent the last two hours chatting away merrily becoming friends.
* 0536 Ok. Now we are really going to start. Since we decided we want to do something with Ethereum and Cardano, 1inch is a good bounty to tackle. However, unfortunately and fortunately! someone already did Cardano integration on 1inch before. 
  * Plan for the next 27 hours (of course it wouldn't be cleanly divided... hackathons are always tumbled... but at least we know when to feel like we are falling behind lol):
    - Step 1 - wrap up research of existing solutions, identify limitations and items of improvements (1hr)
    - Step 2 - decide if we want to build on top of current solution or start from scratch (1hr)
    - Step 3 - design and specify architecture! (6hr)
    - Step 4 - build/hack it! (16hr)
    - Step 5 - because it's a ethglobal, remember to save time for video making and submission prep! (3hr)
* 0818 Got the overall architecture figured out! Interesting stuff! Let's see if it works as expected. Now time to hunt for food.
* 1332 LLM is so bad at Aiken. Wow. Maybe it's faster I go read some tutorials and docs. Trying Plutus Haskell instead.... but this ghcup dependency took forever to install (it's been running for the last 30mins at least.... doesn't help that wifi keeps dropping either). The original LOP-based cardanoswap uses `plu-ts`. Will try that instead.
* 1402 Chatted with 1inch mentors - Aleksandr and this other guy are super patient and helpful. Hopefully it's actually how we understand it.... lol. They also mentioned it'd be cool to implement resolver expiration (if a resolver takes too long, the deal expires i.e. the secret gets open to the public for all other resolvers to process - not sure about race condition :hmm-thinking-face).
* 1500 Yoga time! So nice that Ethglobal always organize some physical sessions to move our rusty joints and rest our brains.