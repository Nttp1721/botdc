const { 
    Client, GatewayIntentBits, AttachmentBuilder, EmbedBuilder, 
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, 
    TextInputBuilder, TextInputStyle, SlashCommandBuilder 
} = require('discord.js');
const { createCanvas } = require('canvas');
const Database = require('better-sqlite3');
const db = new Database('ff_tournament.db');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

// --- KHỞI TẠO DATABASE (Thay thế localStorage) ---
db.prepare(`CREATE TABLE IF NOT EXISTS teams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE,
    games TEXT DEFAULT '[]'
)`).run();

// --- LOGIC TÍNH ĐIỂM (100% từ file HTML) ---
const PLACEMENT_PTS = [12, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0, 0];
const getPlacePts = (top) => (top >= 1 && top <= 12) ? PLACEMENT_PTS[top - 1] : 0;

function calculateTeamStats(gamesJson) {
    const games = JSON.parse(gamesJson);
    let totalElims = 0, totalPlace = 0, booyahs = 0;
    games.forEach(g => {
        totalPlace += getPlacePts(g.top);
        totalElims += (g.elims || 0);
        if (g.top === 1) booyahs++;
    });
    return { totalElims, totalPlace, booyahs, grandTotal: totalElims + totalPlace, matchCount: games.length };
}

// --- HÀM VẼ OVERALL STANDING (Giống StandingCard trong HTML) ---
async function drawOverallStanding() {
    const teams = db.prepare("SELECT * FROM teams").all();
    const sorted = teams.map(t => ({ ...t, stats: calculateTeamStats(t.games) }))
                        .sort((a, b) => b.stats.grandTotal - a.stats.grandTotal);

    const canvas = createCanvas(800, 100 + (sorted.length * 50));
    const ctx = canvas.getContext('2d');

    // Style: xDorzy Custom FF System (Dark Theme)
    ctx.fillStyle = '#0f1117';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Header
    ctx.fillStyle = '#f5c842';
    ctx.font = 'bold 30px Arial';
    ctx.fillText('OVERALL STANDING', 30, 50);

    // Bảng điểm
    ctx.font = '18px Arial';
    ctx.fillStyle = '#6b7280';
    ctx.fillText('RANK', 30, 90);
    ctx.fillText('TEAM', 100, 90);
    ctx.fillText('BOOYAH', 350, 90);
    ctx.fillText('ELIMS', 450, 90);
    ctx.fillText('TOTAL', 550, 90);

    sorted.forEach((t, i) => {
        const y = 130 + (i * 45);
        ctx.fillStyle = i < 3 ? '#f5c842' : '#ffffff'; // Top 3 màu vàng
        ctx.fillText(`${i + 1}`, 30, y);
        ctx.fillText(t.name.toUpperCase(), 100, y);
        ctx.fillText(`${t.stats.booyahs}`, 350, y);
        ctx.fillText(`${t.stats.totalElims}`, 450, y);
        ctx.fillText(`${t.stats.grandTotal}`, 550, y);
    });

    return canvas.toBuffer();
}

// --- XỬ LÝ LỆNH ---
client.on('interactionCreate', async interaction => {
    // 1. Nhập điểm qua Modal (Giống input trên web)
    if (interaction.commandName === 'nhapdiem') {
        const modal = new ModalBuilder()
            .setCustomId('scoreModal')
            .setTitle('Nhập kết quả trận đấu');

        const teamInput = new TextInputBuilder()
            .setCustomId('teamName').setLabel("Tên đội").setStyle(TextInputStyle.Short).setRequired(true);
        const topInput = new TextInputBuilder()
            .setCustomId('top').setLabel("Hạng (1-12)").setStyle(TextInputStyle.Short).setRequired(true);
        const elimInput = new TextInputBuilder()
            .setCustomId('elims').setLabel("Số Elims (mạng)").setStyle(TextInputStyle.Short).setRequired(true);

        modal.addComponents(
            new ActionRowBuilder().addComponents(teamInput),
            new ActionRowBuilder().addComponents(topInput),
            new ActionRowBuilder().addComponents(elimInput)
        );
        await interaction.showModal(modal);
    }

    // 2. Xử lý khi Modal Submit
    if (interaction.isModalSubmit() && interaction.customId === 'scoreModal') {
        const name = interaction.fields.getTextInputValue('teamName');
        const top = parseInt(interaction.fields.getTextInputValue('top'));
        const elims = parseInt(interaction.fields.getTextInputValue('elims'));

        let team = db.prepare("SELECT * FROM teams WHERE name = ?").get(name);
        let games = team ? JSON.parse(team.games) : [];
        games.push({ top, elims });

        if (team) {
            db.prepare("UPDATE teams SET games = ? WHERE name = ?").run(JSON.stringify(games), name);
        } else {
            db.prepare("INSERT INTO teams (name, games) VALUES (?, ?)").run(name, JSON.stringify(games));
        }

        await interaction.reply(`✅ Đã lưu kết quả cho **${name}**: Hạng #${top}, ${elims} Elims.`);
    }

    // 3. Xuất ảnh Overall Standing (100% giống nút 📊 trên web)
    if (interaction.commandName === 'bangdiem') {
        await interaction.deferReply();
        const buffer = await drawOverallStanding();
        const attachment = new AttachmentBuilder(buffer, { name: 'standing.png' });
        await interaction.editReply({ content: '🏆 **BẢNG XẾP HẠNG TỔNG QUAN**', files: [attachment] });
    }
});

client.login(process.env.TOKEN);