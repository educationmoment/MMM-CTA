# MMM-CTA
Add CTA Trains to your magic mirror!


Add this to your config.js

		{
			module: "MMM-CTA",
			position: "bottom_left",
			header: "Pink Line — Ashland",
			config: {
				apiKey: process.env.CTA_API_KEY,
				mapId: 40170, // change the mapId based on the CTA api tracker.
				route: "Pink",
				maxResults: 8,
				updateInterval: 30 * 1000,
				showPlatform: true,  
				showDestination: true,
				countdownMode: "hybrid"
			}
		},
