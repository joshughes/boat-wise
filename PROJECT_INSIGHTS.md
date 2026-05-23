# Project Insights / Adoption Tracking

TideWise does not include telemetry, tracking pixels, external analytics, or phone-home behavior.

Adoption should be estimated with GitHub-native signals only:

- Repository stars
- GitHub Issues from beta testers
- Works For Me / Confirmed Station reports
- GitHub release activity
- GitHub traffic insights

## GitHub Traffic

Open:

```text
GitHub repo -> Insights -> Traffic
```

Watch:

- Views
- Unique visitors
- Clones
- Unique cloners
- Referrers
- Popular content

GitHub traffic data is only available for a recent rolling window, so check it regularly if you want trend history.

## Release Downloads

If `tidewise-card.js` is attached to GitHub Releases, asset download counts can provide a rough signal of manual release interest.

Do not treat release asset downloads as true HACS install counts. HACS behavior, caching, and update paths may not map cleanly to GitHub asset download totals.
