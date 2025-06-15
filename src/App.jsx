import { useState, useEffect } from 'react';
import { MantineProvider, Container, TextInput, Button, Paper, Title, Text, Stack, Group, Select, Alert, Code, ScrollArea, Progress, Collapse, Tabs, Checkbox, Table, Image, ActionIcon, Tooltip } from '@mantine/core';
import { IconDownload, IconBrandYoutube, IconCheck, IconFolder, IconFile, IconTerminal, IconChevronDown, IconChevronUp, IconVideo, IconList, IconRefresh, IconX, IconSelectAll, IconSquareOff } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from '@tauri-apps/plugin-opener';
import { open } from '@tauri-apps/plugin-shell';

function App() {
  const [activeTab, setActiveTab] = useState('video');

  // État partagé
  const [output, setOutput] = useState([]);
  const [progress, setProgress] = useState(0);
  const [downloadSpeed, setDownloadSpeed] = useState('');
  const [eta, setEta] = useState('');
  const [terminalOpen, setTerminalOpen] = useState(true);

  // État pour l'onglet Vidéo unique
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState('audio');
  const [downloading, setDownloading] = useState(false);
  const [downloadedFile, setDownloadedFile] = useState(null);

  // État pour l'onglet Playlist
  const [playlistUrl, setPlaylistUrl] = useState('');
  const [playlistVideos, setPlaylistVideos] = useState([]);
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [loadingPlaylist, setLoadingPlaylist] = useState(false);
  const [downloadingPlaylist, setDownloadingPlaylist] = useState(false);
  const [downloadedPlaylistFiles, setDownloadedPlaylistFiles] = useState([]);
  const [playlistFormat, setPlaylistFormat] = useState('audio');

  useEffect(() => {
    const unlisten = listen('download-output', (event) => {
      console.log(event.payload);
      setOutput(prev => [...prev, event.payload]);

      const progressMatch = String(event.payload).match(/\[download\]\s+(\d+\.\d+)%/);
      const speedMatch = String(event.payload).match(/at\s+([\d.]+[KMG]iB\/s)/);
      const etaMatch = String(event.payload).match(/ETA\s+(\d+:\d+)/);

      if (progressMatch) {
        setProgress(parseFloat(progressMatch[1]));
      }
      if (speedMatch) {
        setDownloadSpeed(speedMatch[1]);
      }
      if (etaMatch) {
        setEta(etaMatch[1]);
      }
    });
    return () => {
      unlisten.then(f => f());
    };
  }, []);

  const resetSharedState = () => {
    setOutput([]);
    setProgress(0);
    setDownloadSpeed('');
    setEta('');
  };

  const handleDownloadSingle = async () => {
    if (!url) {
      notifications.show({
        title: 'Erreur',
        message: 'Veuillez entrer une URL YouTube',
        color: 'red',
      });
      return;
    }

    try {
      setDownloading(true);
      setDownloadedFile(null);
      resetSharedState();

      const filePath = await invoke("download_music", { url, format });

      setDownloadedFile(filePath);
      notifications.show({
        title: 'Succès',
        message: 'Musique téléchargée avec succès !',
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      const errorMessage = error?.toString() || 'Échec du téléchargement';
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red'
      });
      setOutput(prev => [...prev, `Erreur: ${errorMessage}`]);
    } finally {
      setDownloading(false);
    }
  };

  const handleGetPlaylistInfo = async () => {
    if (!playlistUrl) {
      notifications.show({
        title: 'Erreur',
        message: 'Veuillez entrer une URL de playlist YouTube',
        color: 'red',
      });
      return;
    }

    try {
      setLoadingPlaylist(true);
      setPlaylistVideos([]);
      setSelectedVideos([]);
      setDownloadedPlaylistFiles([]);
      resetSharedState();

      const videos = await invoke("get_playlist_info", { playlistUrl });
      setPlaylistVideos(videos);
      notifications.show({
        title: 'Succès',
        message: `Playlist chargée avec ${videos.length} vidéos.`,
        color: 'blue',
      });
    } catch (error) {
      const errorMessage = error?.toString() || 'Échec de la récupération de la playlist';
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red'
      });
      setOutput(prev => [...prev, `Erreur: ${errorMessage}`]);
    } finally {
      setLoadingPlaylist(false);
    }
  };

  const handleDownloadPlaylist = async () => {
    if (selectedVideos.length === 0) {
      notifications.show({
        title: 'Erreur',
        message: 'Veuillez sélectionner au moins une vidéo à télécharger.',
        color: 'red',
      });
      return;
    }

    try {
      setDownloadingPlaylist(true);
      setDownloadedPlaylistFiles([]);
      resetSharedState();

      const files = await invoke("download_playlist_videos", { videoIds: selectedVideos, format: playlistFormat });
      setDownloadedPlaylistFiles(files);
      notifications.show({
        title: 'Succès',
        message: `${files.length} vidéo(s) de la playlist téléchargée(s) avec succès !`,
        color: 'green',
        icon: <IconCheck size={16} />,
      });
    } catch (error) {
      const errorMessage = error?.toString() || 'Échec du téléchargement de la playlist';
      notifications.show({
        title: 'Erreur',
        message: errorMessage,
        color: 'red'
      });
      setOutput(prev => [...prev, `Erreur: ${errorMessage}`]);
    } finally {
      setDownloadingPlaylist(false);
    }
  };

  const handleOpenFile = async (filePath) => {
    if (filePath) {
      try {
        await open(filePath);
      } catch (error) {
        notifications.show({
          title: 'Erreur',
          message: 'Impossible d\'ouvrir le fichier',
          color: 'red',
        });
      }
    }
  };

  const handleRevealFile = async (filePath) => {
    if (filePath) {
      try {
        await revealItemInDir(filePath);
      } catch (error) {
        notifications.show({
          title: 'Erreur',
          message: 'Impossible de localiser le fichier',
          color: 'red',
        });
      }
    }
  };

  const toggleSelectVideo = (videoId) => {
    setSelectedVideos(prev =>
      prev.includes(videoId)
        ? prev.filter(id => id !== videoId)
        : [...prev, videoId]
    );
  };

  const toggleSelectAllVideos = () => {
    if (selectedVideos.length === playlistVideos.length) {
      setSelectedVideos([]);
    } else {
      setSelectedVideos(playlistVideos.map(v => v.id));
    }
  };

  const rows = playlistVideos.map((video) => (
    <Table.Tr key={video.id}>
      <Table.Td>
        <Checkbox
          checked={selectedVideos.includes(video.id)}
          onChange={() => toggleSelectVideo(video.id)}
          color="orange"
        />
      </Table.Td>
      <Table.Td>
        <Image src={video.thumbnail} alt={video.title} width={120} height={67} radius="sm" />
      </Table.Td>
      <Table.Td>{video.title}</Table.Td>
      <Table.Td>{video.uploader}</Table.Td>
      <Table.Td>{video.duration}</Table.Td>
    </Table.Tr>
  ));

  return (
    <MantineProvider theme={{ colorScheme: 'dark' }}>
      <Container size="lg" py="xl">
        <Paper shadow="md" p="xl" radius="md">
          <Stack spacing="lg">
            <Group align="center" justify="center">
              <IconBrandYoutube size={40} color="red" />
              <Title order={1}>YouTube Downloader</Title>
            </Group>

            <Tabs value={activeTab} onChange={setActiveTab} color="orange">
              <Tabs.List grow>
                <Tabs.Tab value="video" icon={<IconVideo size={16} />}>Vidéo Unique</Tabs.Tab>
                <Tabs.Tab value="playlist" icon={<IconList size={16} />}>Playlist</Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="video" pt="lg">
                <Stack spacing="lg">
                  <Text c="dimmed" ta="center">
                    Entrez une URL YouTube pour télécharger la musique ou la vidéo.
                  </Text>
                  <TextInput
                    placeholder="https://www.youtube.com/watch?v=..."
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    size="lg"
                    leftSection={<IconBrandYoutube size={20} />}
                  />
                  <Select
                    label="Format"
                    value={format}
                    onChange={setFormat}
                    data={[
                      { value: 'audio', label: 'Audio (mp3)' },
                      { value: 'video', label: 'Vidéo (mp4)' },
                    ]}
                  />
                  <Button
                    size="lg"
                    leftSection={<IconDownload size={20} />}
                    loading={downloading}
                    onClick={handleDownloadSingle}
                    variant="gradient"
                    gradient={{ from: 'red', to: 'orange' }}
                  >
                    {downloading ? 'Téléchargement en cours...' : 'Télécharger'}
                  </Button>
                  {downloadedFile && (
                    <Alert title="Téléchargement réussi" color="green" icon={<IconCheck size={16} />}>
                      <Stack spacing="xs">
                        <Text>Fichier : {downloadedFile.split(/[\\/]/).pop()}</Text>
                        <Text size="sm" c="dimmed">Dossier : {downloadedFile.substring(0, downloadedFile.lastIndexOf('/') + 1)}</Text>
                        <Group mt="sm">
                          <Button
                            variant="light"
                            size="sm"
                            leftSection={<IconFile size={16} />}
                            onClick={() => handleOpenFile(downloadedFile)}
                          >
                            Ouvrir le fichier
                          </Button>
                          <Button
                            variant="light"
                            size="sm"
                            leftSection={<IconFolder size={16} />}
                            onClick={() => handleRevealFile(downloadedFile)}
                          >
                            Localiser le fichier
                          </Button>
                        </Group>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Tabs.Panel>

              <Tabs.Panel value="playlist" pt="lg">
                <Stack spacing="lg">
                  <Text c="dimmed" ta="center">
                    Entrez l'URL d'une playlist YouTube pour afficher et télécharger ses vidéos.
                  </Text>
                  <Group grow>
                    <TextInput
                      placeholder="https://www.youtube.com/playlist?list=..."
                      value={playlistUrl}
                      onChange={(e) => setPlaylistUrl(e.target.value)}
                      size="md"
                      leftSection={<IconBrandYoutube size={20} />}
                      style={{ flexGrow: 1 }}
                    />
                    <Button
                      size="md"
                      variant="gradient"
                      gradient={{ from: 'red', to: 'orange' }}
                      leftSection={<IconRefresh size={20} />}
                      loading={loadingPlaylist}
                      onClick={handleGetPlaylistInfo}
                    >
                      Charger la Playlist
                    </Button>
                  </Group>

                  {playlistVideos.length > 0 && (
                    <>
                      <Group justify="space-between">
                        <Text>Vidéos dans la playlist: {playlistVideos.length}</Text>
                        <Text>Sélectionnées: {selectedVideos.length}</Text>
                      </Group>
                      <Group>
                        <Button 
                          variant="gradient" 
                          gradient={{ from: 'red', to: 'orange' }} 
                          size="xs" 
                          onClick={toggleSelectAllVideos}
                          leftSection={selectedVideos.length === playlistVideos.length ? <IconSquareOff size={16} /> : <IconSelectAll size={16} />}
                        >
                          {selectedVideos.length === playlistVideos.length ? 'Désélectionner tout' : 'Sélectionner tout'}
                        </Button>
                      </Group>
                      <ScrollArea h={300} type="auto">
                        <Table striped highlightOnHover withTableBorder withColumnBorders>
                          <Table.Thead>
                            <Table.Tr>
                              <Table.Th>
                                <Checkbox
                                  checked={playlistVideos.length > 0 && selectedVideos.length === playlistVideos.length}
                                  indeterminate={selectedVideos.length > 0 && selectedVideos.length < playlistVideos.length}
                                  onChange={toggleSelectAllVideos}
                                  color="orange"
                                />
                              </Table.Th>
                              <Table.Th>Miniature</Table.Th>
                              <Table.Th>Titre</Table.Th>
                              <Table.Th>Chaîne</Table.Th>
                              <Table.Th>Durée</Table.Th>
                            </Table.Tr>
                          </Table.Thead>
                          <Table.Tbody>{rows}</Table.Tbody>
                        </Table>
                      </ScrollArea>
                      <Select
                        label="Format pour la playlist"
                        value={playlistFormat}
                        onChange={setPlaylistFormat}
                        data={[
                          { value: 'audio', label: 'Audio (mp3)' },
                          { value: 'video', label: 'Vidéo (mp4)' },
                        ]}
                      />
                      <Button
                        size="lg"
                        leftSection={<IconDownload size={20} />}
                        loading={downloadingPlaylist}
                        onClick={handleDownloadPlaylist}
                        disabled={selectedVideos.length === 0}
                        variant="gradient"
                        gradient={{ from: 'red', to: 'orange' }}
                      >
                        {downloadingPlaylist ? `Téléchargement en cours (${selectedVideos.length} vidéos)...` : `Télécharger les ${selectedVideos.length} vidéos sélectionnées`}
                      </Button>
                    </>
                  )}
                  {downloadedPlaylistFiles.length > 0 && (
                    <Alert title="Téléchargement de la playlist réussi" color="green" icon={<IconCheck size={16} />}>
                      <Stack spacing="xs">
                        <Text>{downloadedPlaylistFiles.length} fichier(s) téléchargé(s) :</Text>
                        <ScrollArea h={100}>
                        {downloadedPlaylistFiles.map((file, index) => (
                          <Group key={index} justify="space-between">
                            <Text size="sm">{file.split(/[\\/]/).pop()}</Text>
                            <Group>
                              <Tooltip label="Ouvrir le fichier">
                                <ActionIcon variant="light" onClick={() => handleOpenFile(file)}><IconFile size={16} /></ActionIcon>
                              </Tooltip>
                              <Tooltip label="Localiser le fichier">
                                <ActionIcon variant="light" onClick={() => handleRevealFile(file)}><IconFolder size={16} /></ActionIcon>
                              </Tooltip>
                            </Group>
                          </Group>
                        ))}
                        </ScrollArea>
                      </Stack>
                    </Alert>
                  )}
                </Stack>
              </Tabs.Panel>
            </Tabs>

            {/* Terminal Output - Partagé */}
            <Paper withBorder p="md" radius="md" mt="xl">
              {(downloading || downloadingPlaylist) && (
                <Stack spacing="xs" mb="md">
                  <Group justify="space-between">
                    <Text size="sm">Progression</Text>
                    <Text size="sm">{progress.toFixed(1)}%</Text>
                  </Group>
                  <Progress value={progress} size="sm" />
                  <Group justify="space-between">
                    <Text size="sm">Vitesse: {downloadSpeed}</Text>
                    <Text size="sm">Temps restant: {eta}</Text>
                  </Group>
                </Stack>
              )}
              <Group mb="xs" justify="space-between">
                <Group>
                  <IconTerminal size={20} />
                  <Text fw={500}>Sortie de la commande</Text>
                </Group>
                <Button
                  variant="subtle"
                  size="xs"
                  onClick={() => setTerminalOpen(!terminalOpen)}
                  leftSection={terminalOpen ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
                >
                  {terminalOpen ? 'Réduire' : 'Développer'}
                </Button>
              </Group>
              <Collapse in={terminalOpen}>
                <ScrollArea h={200} type="auto">
                  <Code block style={{ backgroundColor: '#1a1b1e', whiteSpace: 'pre-wrap', minHeight: '200px' }}>
                    {output.length > 0
                      ? output.map((line, index) => (
                          <div key={index} style={{ color: '#e9ecef' }}>{line}</div>
                        ))
                      : <div style={{ color: '#868e96', textAlign: 'center', padding: '2rem 0' }}>
                          En attente d'une commande...
                        </div>
                    }
                  </Code>
                </ScrollArea>
              </Collapse>
            </Paper>
          </Stack>
        </Paper>
      </Container>
    </MantineProvider>
  );
}

export default App;
