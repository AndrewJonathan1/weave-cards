# 2026-03-15 — Call with Andrew Ippoliti Sunday — taste-before-the-prompt

**Audio:** 2026-03-15_call-with-andrew-ippoliti-sunday_taste-before-the-prompt.m4a
**Original filename:** Call with Andrew Ippoliti Sunday Combined.m4a
**Duration:** 21m 15s
**Speakers:** Jonathan, Andrew
**Model:** universal-3-pro
**Language:** en

---

**Andrew** (0:00 - 0:11):
So I would recommend maybe 2 or 3 things. Thing number 1, send me an image that you're like, I just wanna know what you think in terms of—

**Jonathan** (0:11 - 0:12):
The last one.

**Andrew** (0:12 - 0:23):
Print this. Okay, great. Then send me a prompt that you've used and I'll try it on some of my local models.

**Jonathan** (0:27 - 1:09):
How do we go from a person with a felt sense of something to like actually carrying forward their implying? I'm just like not very clear about this because the way that I've been able to get the best things that make sense as wedding cards is like literally by taking other people's wedding cards and like, and then it's like, okay, go like refactor this or, Maybe we just do that. We just like, I'm like, I don't know, it seems a little sketchy to like just take people's wedding cards and then it's like, do we have like a whole library of preexisting things and they kind of pick and then you merge anyway? Yeah. Thoughts about that?

**Andrew** (1:09 - 1:47):
Yeah, I think that's sort of where the, the skill of doing this is where like for me, I know that it's not necessarily a felt sense that I can capture in a way that there may be certain things for myself or for certain experiences that I know how to capture and convey. I don't necessarily think that wedding cards and things— I don't think I can do that in the general case for that. Domain.

**Jonathan** (1:50 - 2:31):
Let's not worry about this domain. I'm kind of curious, like, if you had a— is there a domain that you are familiar with for an image gen thing? And like, how would you customize someone that wanted like the goth version of that, or like the, the pinkcore version, or like, how would you even like do that? It's like an interesting question. And it's like the same thing for— it's like, how do you— I mean, for text it's easier, right? Because it's like Oh, write this if you're an enduring patterner. It just like works better. But with images, it like tastes somehow like is a lot more— I don't know, I can't write like, say, best storytelling practices, or— and it doesn't necessarily convert.

**Andrew** (2:35 - 3:05):
Yeah, I don't quite know that either because for example, people may have a certain color palette that they like, or they may be going for a certain kind of feel that they get when they look at the card. And I don't necessarily know how to capture that. There's typically, uh, the—

**Jonathan** (3:06 - 3:13):
past Andrew Self gave me a question, gave me an answer, but go ahead. I'm gonna write it down. Okay, go ahead.

**Andrew** (3:13 - 3:29):
The— okay, uh, thanks. The— what most people do in the image gen community is they start with, uh, pictures that they like that other people have.

**Jonathan** (3:29 - 3:30):
Yeah, exactly.

**Andrew** (3:30 - 3:47):
And then look at the prompt, copy it, and then just start editing. There's also this like different models behave differently with prose versus JSON style versus structured things versus other stuff.

**Jonathan** (3:49 - 4:09):
So let's even separate out that question. I think there's the question of taste and there's a question of prompting. I think we answer the question of taste first and then we worry about prompting. But in terms of even taste, that's not clear to me. Prompting almost seems like an easier problem to solve once you know what you're going for.

**Andrew** (4:14 - 4:46):
I think I agree with that. I mean, I'm not necessarily sure that the prompting will be easier, but it's more like if we have a clear target from a taste perspective, then I'm pretty confident that I figured out with 1,000 prompts that we can test and then we can judge like, no, this actually isn't scalable and feasible because we can't find a model that steers well enough.

**Jonathan** (4:46 - 6:30):
Like I've, I've like, okay, let me just tell you what I've, I've been doing. So I would find like what I found works well is like I find an image that like, oh, this, this is good, but I don't like this. Yeah, but I like it from this one. Can you like take this one and then generate— okay, now like change this so that it's like— it's not sometimes great at crossing two things, but at least what it seems like it works well if you have one image and you like it, you modify one thing about it, that seems to like work. So if we're trying to like ship as quickly as possible, in a way that feels reasonable. Like, it seems pretty reasonable to just be like, bring us some shit you like, or be like, just open Google Images in front of you, just type in shit. Either we've built up a repository of our own shit that like we feel good enough about not stealing other people's shit. It's like a blend of stuff, so it's no one's like distinct thing. And like we blend it in front of them. And then like you can either feed the prompt like an image and just tell it to directly mod the text, or you could just like directly mod specific image elements, uh, or like take the font from this, or like that seems— that, that Frankenstein-ish kind of approach seems like feasible. And then it gives like a something for the bride to look at. This also just seems like, how do fucking like actual, like letter, like wedding card designers do it? Like how do they? So this is just like one approach. Plus you have the 20 questions approach, which was inner Andrew's answer.

**Andrew** (6:34 - 8:06):
Well, yeah, the, the 20 questions does give you a huge range of, of things, but it, designers literally go and design the thing they have. The vocabulary of like, okay, tall thin letters are elegant, short fat letters are bold, and like this kind of font, like this family of fonts is for this sort of feeling and aesthetic. And like, oh, I have all of these special paintbrushes for Photoshop that make things look this way. I think that's like a graphic designer vocabulary and just like general designer vocabulary. And they have the skills to listen for what the other person is saying, capture it, and then make it. And it's very much an art because I think that there's a whole lot of— there is back and forth. There's a lot of interviewing that goes on with designers and things like that. So there's all of that to, I think, consider. It's not just like they randomly have something that works. Yeah.

**Jonathan** (8:07 - 8:13):
Yeah. Yeah, this could be worth maybe asking design friends how they do this.

**Andrew** (8:18 - 8:52):
Yeah. And I think there will be the less technical ones who are just like, oh, I just edit until it feels right. Yeah, and then there may be the more technical ones who are like, okay, well, first they said this. And I guess I've seen designers also give like a huge output document of like, we chose blah blah blah because of blah blah blah, and things like that.

**Jonathan** (8:52 - 10:19):
So typically within most designers' processes I have a feeling it might not hurt for us to just like think about how we would do it. I feel like there could be some interesting ways that we come up with that. I don't know, maybe I'm in like the anti-Felix camp sometimes of like, don't reinvent the wheel. But I think that actually could be a good thing with AI a lot of times. Like, like Just as an example, I wonder if like, is there a way to not infinitely like, okay, one way is just like a test. So like you could have like A or B, which one do you like more? Okay, that could take forever. Okay, so you have A, B, C, D, E, F, G, H, I, J, and you try to like always have like the more disparate design. Okay, that could still feel like you're going forever because maybe the space is like too big. I'm like going on Minted right now and it's like, it's hard to even feel like categorization, but there could be some kind of like test thing or something that like somehow like hones in on like, like something like 20 questions except like there could be like multiple choice answers for each one. I don't know, what do you think?

**Andrew** (10:21 - 11:39):
Yeah, there's typically, uh, things you may want to ask Claude or something for a typical design brand. Oh yeah, survey. Um, because they'll have things like, like art scales and things like that where it's like there's maybe 10 pairs of adjectives that the designers choose, and then they're like, okay, between this adjective and this adjective, pick how much the, the brand should be towards side A versus side B. And then that sort of completes the, the thing. And then of course there's like freeform questions and things like that, but like, That's sort of the one place to start looking. And then there's definitely design systems and other things that are like, for elegant things, do this. For playful things, do this. For other kinds of things, do that. Like, there will be— lots of guides once we have those specific—

**Jonathan** (11:39 - 12:31):
Wait, I have an idea. I have an idea. Okay, so I literally go on to Minted, download every single image in their entire index, and then have Claude like categorize, just like put like felt sense like tags, like as many as possible. Then you like, like, like you almost like put all of them in like a canvas and then like, you like just like chat against it and it just like things fly across the canvas by like grouping of like, we think you like this and you kind of like move things over. Some kind of experience like that, I think, could be really interesting.

**Andrew** (12:37 - 13:37):
Yeah, I think that could be interesting. I just don't know how well things would be captured and it's just like Okay, go ahead. Uh, so I, I think what you said could work, but it's another matter of trying. It gives us some guidance for visually understanding what a particular feel is. But I think it's also important to maybe aim to match standard design vocabulary.

**Jonathan** (13:38 - 14:02):
As I'm feeling into it, I could feel myself being like, bitch, just ship it. I'm like, okay, like I feel like we could at least do this async with someone. Maybe, I think maybe it's time to start talking to, maybe we have enough here to, I was like, okay, we can clearly make stuff. I guess the question for you is, can we print stuff based off of what you saw?

**Andrew** (14:05 - 14:07):
I need to go through the—

**Jonathan** (14:08 - 14:09):
Images.

**Andrew** (14:09 - 14:12):
The ones, yeah, and then I can tell you.

**Jonathan** (14:12 - 14:12):
Okay.

**Andrew** (14:14 - 14:21):
And I won't get to do that until sometime later today.

**Jonathan** (14:21 - 14:25):
Okay. Okay, cool. Well, I'm going to go to sleep soon, so.

**Andrew** (14:26 - 14:42):
Okay, cool. Yeah, basically you should have some comments from me tomorrow and yeah, I'll look at the specifically the one that you sent the image.

**Jonathan** (14:43 - 14:53):
Cool. And just look through— maybe I don't understand what you're looking through. I was just imagining that it was like a resolution thing, but it sounds like it's more complicated than that.

**Andrew** (14:54 - 15:32):
Well, okay. So like there's a couple of things in terms of like, well, there's the actual paper size. Then the paper gets cut and things like that. So there's certain— ensuring that you have things— I mean, basically the layout looks fine. We just want to make sure that things don't get cut in a weird place or things like that. So I need to see what the margins on the actual printer are and other things of that nature.

**Jonathan** (15:33 - 16:01):
Cool. And I mean, like, we could always constrain it based off of design. It's like you can only do designs that don't go up to the border. Like, if you look above, like, they're like— I mean, maybe the design you can't tell where it's cut because it's cut like the borders, like the flowers are randomly cut off. I think we just need to be like skillful in the designs that we pick so that it won't run into like those particular types of edge cases.

**Andrew** (16:03 - 16:03):
Yep.

**Jonathan** (16:05 - 16:19):
Then we can just— yeah. I feel like somehow we just need to do a bunch of these for realsies, but I'm just like, I guess we should just send some off to print or something. I don't know. I'll let you take a look at it first.

**Andrew** (16:22 - 16:42):
There's 3 open questions. Number 1, is actual aesthetics. Uh, do you— I'll say, do you like the aesthetics of what we're shipping? And then we can validate that with actual people later, but like, that's thing number one.

**Jonathan** (16:42 - 16:44):
That's validated. I feel confident about that.

**Andrew** (16:44 - 16:44):
Okay.

**Jonathan** (16:45 - 16:47):
That's not a bottleneck.

**Andrew** (16:47 - 17:26):
So then, okay. So then number two is Can we reliably get the aesthetics that we want? I think that is still slightly up for grabs, but we can try it. And then 3 is, does it print? So like, I'll look at the does it print stuff and maybe some of the— like, I'll look mainly at 3 and a little bit of 2 and the 2 focus on 1 and 2.

**Jonathan** (17:26 - 18:02):
Yeah, 2 I know we can do. It's just a matter of how we like— like if you tell me we have a bride that's like, yo, I'll totally help you do this and like, I'm willing to spend as much time as you— with you as you want to. I'm 100% confident we can do it. The question is, can we do it skillfully in the right amount of time with minimal back and forth? My dream for this is that a bride opens up a page and verbally talks to AI and just refines the design in a couple minutes.

**Andrew** (18:02 - 18:06):
It just changes in front of her and she's like, oh my God, that's so cool.

**Jonathan** (18:06 - 18:44):
That's exactly what I wanted. That's like what I ultimately want to get to. Um, I think that'll be a really magical experience. But for right now, I'm okay with even async back and forth. But ideally, we can do it live in front of her. I don't think we're there yet. I think we still have to do async or else she's just like sitting there as I like type in Claude. But I think even eventually then we can like, we can be on a call. Andrew's in the back, I'm in the front. And then we just try to like live steer and get real-time feedback. That's kind of what I'm seeing. Any thoughts about that?

**Andrew** (18:46 - 18:50):
Yeah, I think that makes sense. But once again, one step at a time.

**Jonathan** (18:50 - 20:24):
Cool. I'm pretty sure I can get there just from what I played around with today. I feel good about too. I think we will really refine it much faster if we have real literal people in front of us. Who are okay with back and forth. I think that's the thing. So I'm thinking about like people have talked about like having, or Claude people, Claude has talked about like having like found it, well, popcorn kernel, like founding customers. So I think if we just offered like a, like a big discount. It's like we typically charge $3,500 for this, but like for early customers, we're charging like some, like ridiculous, like $1,500, uh, plus like cost of printing, which should be like under a couple hundred dollars. Um, do you think we should just like go for that? I guess I'll wait for you to tomorrow. But if you say like, yep, this should print, it's like, this is high res as fuck, man. And the image that I gave you was cropped or generated as a 4:3 and Claude extended the white so it exported at 5:7. I love that Claude could just like help me do that because it was just white so it could like fuck around with margins. Thoughts about just—

**Andrew** (20:25 - 20:26):
That sounds like a good approach.

**Jonathan** (20:27 - 20:29):
The founding customer, $1,500.

**Andrew** (20:31 - 20:31):
Yeah.

**Jonathan** (20:32 - 20:32):
Okay.

**Andrew** (20:33 - 20:33):
Okay.

**Jonathan** (20:33 - 20:52):
So then if that's the case, I'm thinking about just like leaving you with more of the technical detail things and I can switch over to just like what's the specific like container that we can tell them. Like at least we can guarantee that. It's like in this stage we're in like a back and forth.

**Andrew** (20:53 - 21:09):
So we should. End the call now because I need to go, so I'm not paying attention. And like, okay, there's a ton of stuff that it sounds like you want to offload to me, so I'm going to ignore that and we should have a, like, a proper conversation about it later.

**Jonathan** (21:09 - 21:11):
Cool, sounds good. I'll talk to you later.

**Andrew** (21:11 - 21:13):
Cool. All right, bye.

---

*Transcribed with AssemblyAI universal-3-pro on 2026-03-18*