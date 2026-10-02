describe("Announcement model", () => {
  it("should create an announcement", async () => {
    const { Announcement, User } = global.__MODELS__;
    const user = await User.create({ email: "fab@links.com" });
    const announcement = await Announcement.create({
      start: new Date("2025-01-01"),
      end: new Date("2025-01-02"),
      description: "New Year celebration",
      made_by: user.id,
      title: "test",
    });

    expect(announcement.id).toBeDefined();
    expect(announcement.description).toBe("New Year celebration");
  });

  it("should fetch announcements", async () => {
    const { Announcement, User } = global.__MODELS__;
    const user = await User.create({ email: "fab@links.com" });

    await Announcement.create({
      start: new Date("2025-02-01"),
      end: new Date("2025-02-02"),
      description: "Test Event",
      made_by: user.id,
      title: "test",
    });

    const announcements = await Announcement.findAll();
    expect(announcements.length).toBeGreaterThan(0);
  });
});
