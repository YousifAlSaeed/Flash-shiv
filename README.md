<p align="center">
  <img src="assets/badge.svg" width="220" alt="Flash Shiv logo: a winged dagger inside a red diamond">
</p>

# Flash Shiv

**A two-player card duel about staying ahead by the smallest margin.**

Every card you play has to beat your opponent's total. Play too little and you lose on the spot. Play too much and you've burned a card you'll want later. Four kinds of special card can flip the whole fight in a single move.

Play it in your browser against the computer, or open a room and duel a friend online.

## Features

- **Two ways to play** — a computer opponent that plays fair (it never looks at your hand), or online rooms you join with a four-letter code or an invite link. Online play needs no server: two browsers can connect directly.
- **Dark neon fantasy look** — a glowing red and black table with touches of blue.
- **Artwork on every card** — each number sits inside its own shape, each special card has its own picture, and the Shiv is a winged dagger.
- **Sound effects made from scratch** — thunder for Strike, chimes for Mirror, a bomb for Blast, a deep swell for Force. All generated live in the browser; there isn't a single audio file in the game.
- **Three generated music tracks** — Chill, Tense and Epic, switchable from the settings panel, with separate volume controls for music and sound effects.
- **Move previews** — select a card and the game tells you exactly what it will do before you commit.
- **An optional game server** — run the included server and it runs every match, so no browser ever receives the other player's hand.
- **Nothing to install** — plain HTML, CSS and JavaScript, plus a small Node.js server with no dependencies. The only outside library is PeerJS, loaded when two browsers connect directly.

## How to play

Each player gets 16 cards: 10 in hand and 6 in a face-down deck.

1. **Shiv.** A round opens with both players flipping the top card of their deck onto the field. Special cards count as 1 here.
2. **Attack.** Whoever has the lower total must play a card from their hand to push their total **above** the opponent's.
3. **Pressure passes back.** Now the other player is behind, and must attack in turn.
4. **Tie?** If the totals are ever equal, the field is cleared and both players shiv again.

You lose if:

- your attack leaves you **below** your opponent,
- you have **no cards** left on your turn, or
- your **last card is a special card** — that's a foul.

## The cards

| Card | In the deck | What it does |
| --- | --- | --- |
| **Shiv (1)** | 2 | Brings back your cancelled card, so its value counts again. If you have no cancelled card, it adds 1 to your total. |
| **2 – 7** | 5, 5, 5, 4, 3, 2 | Adds its value to your total. |
| **Strike** | 2 | Cancels the last card your opponent played. The card stays on the table, but its value is no longer counted. |
| **Mirror** | 2 | Swaps the two piles. Their lead becomes yours. |
| **Blast** | 2 | Destroys a hidden card from your opponent's hand, then you attack again. |
| **Force** | 2 | Doubles your total. A Strike can cancel it. |

**Cancelled cards.** When a Strike cancels your card, you have two choices on your turn: play a Shiv to bring that card back, or play any other card, which takes the cancelled card's place.

The full deck has 34 cards and each game deals 32 of them, so two cards are always missing and you can never be completely sure what's still out there.

## Play it

**[Play Flash Shiv in your browser](https://yousifalsaeed.github.io/Flash-shiv/)**

- **Against the computer:** choose **VS computer**.
- **Against a friend:** enter your name, choose **Create online room**, and send your friend the room code or the invite link. They enter their own name when they join, and each player sees the other's name during the game.

### How online play works

The game picks one of two ways to connect, automatically:

- **Directly between the two browsers.** This is what the link above uses, because that site only hosts files. The player who creates the room runs the match in their browser, so they need to keep their tab open. A free public service (PeerJS) introduces the two browsers to each other. Some networks block direct connections; if a friend can't join, that is the usual reason.
- **Through the game server.** If you run the included server, it runs every match itself, each player's browser only ever receives its own hand, and a player who drops out can come back.

## Running it yourself

Download the project and open `index.html` in a browser to play the computer.

To run the game server you need [Node.js](https://nodejs.org). From the project folder, run:

```bash
node server/server.js
```

Open the address it prints (for example `http://localhost:3000`). Players on the same network can join using the network address the server prints.

## Project layout

```
index.html          The page
css/style.css       All styling
js/cards.js         The cards and the deck
js/rules.js         The game rules (shared by the browser and the server)
js/card-art.js      The artwork on each card
js/ai.js            The computer opponent
js/ui.js            Drawing the screen
js/table.js         Card selection and move previews
js/local.js         Game flow against the computer
js/match.js         Runs an online match (shared by the server and the room creator's browser)
js/online.js        Online play: connecting, through the server or directly
js/sound.js         Sound effects
js/music.js         Music player
js/music-*.js       The three music tracks
js/main.js          Menu and settings
server/server.js    Online server
assets/             The logo
```

## Built with

HTML, CSS, JavaScript, the Web Audio API, WebRTC (through PeerJS) and Node.js.
