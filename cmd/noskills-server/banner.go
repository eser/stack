package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"

	"github.com/eser/stack/pkg/ajan/noskillsserverfx"
)

const (
	colorPurple = lipgloss.Color("#7c3aed")
	colorFaint  = lipgloss.Color("#94a3b8")
	colorGreen  = lipgloss.Color("#22c55e")
)

func printStartupBanner(addr, pin, fingerprint string) {
	boxStyle := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(colorPurple).
		Padding(0, 2).
		Width(50)

	labelStyle := lipgloss.NewStyle().
		Foreground(colorFaint).
		Width(16)

	valueStyle := lipgloss.NewStyle().
		Bold(true)

	pinStyle := lipgloss.NewStyle().
		Bold(true).
		Foreground(colorGreen).
		Padding(0, 1).
		Background(lipgloss.Color("#1e1b4b"))

	host := "localhost"
	if addr != "" && addr[0] != ':' {
		// addr is host:port — take host part
		if idx := strings.LastIndex(addr, ":"); idx >= 0 {
			host = addr[:idx]
			addr = addr[idx:]
		}
	}

	lines := []string{
		lipgloss.NewStyle().Bold(true).Foreground(colorPurple).Render("noskills-server") +
			lipgloss.NewStyle().Foreground(colorFaint).Render(" "+noskillsserverfx.Version),
		"",
		labelStyle.Render("PIN") + "    " + pinStyle.Render("  "+pin+"  "),
		labelStyle.Render("URL") + "    " + valueStyle.Render("https://"+host+addr),
	}

	if fingerprint != "" {
		fpShort := fingerprint
		if len(fpShort) > 24 {
			fpShort = fpShort[:12] + "…" + fpShort[len(fpShort)-12:]
		}

		lines = append(lines,
			labelStyle.Render("Cert")+
				"    "+
				lipgloss.NewStyle().Foreground(colorFaint).Render(fpShort),
		)
	}

	lines = append(lines,
		"",
		lipgloss.NewStyle().Foreground(colorFaint).Italic(true).
			Render("noskills-server doctor  to check health"),
		lipgloss.NewStyle().Foreground(colorFaint).Italic(true).
			Render("noskills-server pin     to reprint this PIN"),
	)

	fmt.Println()
	fmt.Println(boxStyle.Render(strings.Join(lines, "\n")))
	fmt.Println()
}
